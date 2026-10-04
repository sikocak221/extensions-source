// InkStory, ported from keiyoushi/extensions-source lib-multisrc/inkstory. This directory is a template: every
// extension using the theme keeps an identical copy in src/inkstory/ (`node scripts/sync-multisrc.mjs`).
import type {
  Chapter,
  Filter,
  FilterState,
  ImageTransform,
  MangaDetails,
  MangaPage,
  MangaStatus,
  MangaSummary,
  Page,
  Preference,
  Source,
} from '@matane/extension-sdk';
import { absoluteUrl } from './utils';

const API_URL = 'https://api.inuko.me/v2';
const PAGE_SIZE = 30;
const IMAGE_NAME_LENGTH = 36;
const IMAGE_MODE_INDEX = 14;
const MIN_IMAGE_SIGNATURE_SIZE = 12;
const SECRET_KEY = Array.from('UySkp0BzPhwlvP2V', (c) => c.charCodeAt(0));
const PREF_CHAPTER_BRANCH_MODE = 'inkstory_chapter_branch_mode';
const PREF_PREFERRED_BRANCH_QUERY = 'inkstory_preferred_branch_query';
const DELAY_CHAPTERS = 'delay_chapters';

const ORDERS: [string, string][] = [
  ['viewsCount', 'Просмотрам'],
  ['likesCount', 'Лайкам'],
  ['chaptersCount', 'Главам'],
  ['bookmarksCount', 'Закладкам'],
  ['averageRating', 'Рейтингу'],
  ['createdAt', 'Дате добавления'],
];
/** Checkbox groups: filter id, request parameter, title, values. */
const MULTI: { id: string; param: string; label: string; values: [string, string][] }[] = [
  {
    id: 'format',
    param: 'formats',
    label: 'Форматы',
    values: [
      ['FOURTH_KOMA', 'Енкома'],
      ['COMPILATION', 'Сборник'],
      ['DOUJINSHI', 'Додзинси'],
      ['WEBTOON', 'Вебтун'],
      ['COLORED', 'Цветной'],
      ['ARTBOOK', 'Артбук'],
      ['SINGLE', 'Сингл'],
      ['LIGHT', 'Лайт'],
      ['WEB', 'Веб'],
    ],
  },
  {
    id: 'contentStatus',
    param: 'contentStatus',
    label: 'Контент-статусы',
    values: [
      ['SAFE', 'Безопасный'],
      ['UNSAFE', 'Небезопасный'],
      ['EROTIC', 'Эротический'],
    ],
  },
  {
    id: 'country',
    param: 'country',
    label: 'Страны',
    values: [
      ['RUSSIA', 'Россия'],
      ['JAPAN', 'Япония'],
      ['KOREA', 'Корея'],
      ['CHINA', 'Китай'],
      ['OTHER', 'Другое'],
    ],
  },
  {
    id: 'status',
    param: 'status',
    label: 'Статусы',
    values: [
      ['ONGOING', 'Онгоинг'],
      ['DONE', 'Завершен'],
      ['FROZEN', 'Заморожен'],
      ['ANNOUNCE', 'Анонс'],
    ],
  },
];
const RANGES: { id: string; label: string; min: string; max: string; from: number; to: number; decimal?: boolean }[] = [
  { id: 'rating', label: 'Рейтинг', min: 'averageRatingMin', max: 'averageRatingMax', from: 0, to: 10, decimal: true },
  { id: 'year', label: 'Год выпуска', min: 'yearMin', max: 'yearMax', from: 1900, to: 2100 },
  { id: 'chapters', label: 'Количество глав', min: 'chaptersCountMin', max: 'chaptersCountMax', from: 0, to: 100000 },
];

interface Name {
  ru?: string | null;
  en?: string | null;
  original?: string | null;
}
interface BookDto {
  id: string;
  slug: string;
  poster?: string | null;
  name: Name;
}
interface Publisher {
  name?: string | null;
}

const resolveTitle = (name: Name, fallback: string) =>
  [name.ru, name.en, name.original].find((n) => n?.trim()) ?? fallback;

const formatInt = (value: number) =>
  value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(1)}M`
    : value >= 1000
      ? `${(value / 1000).toFixed(1)}k`
      : String(value);

/** Parses "2026-04-21T16:25:38.397514Z" (QuickJS wants at most 3 fraction digits). */
const parseTime = (text?: string | null): number | undefined => {
  if (!text) return undefined;
  const time = Date.parse(text.replace(/(\.\d{3})\d+/, '$1'));
  return Number.isNaN(time) ? undefined : time;
};

function normalizeNumber(raw: unknown, min: number, max: number, decimal = false): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const text = raw.trim().replace(',', '.');
  if (!text) return undefined;
  const value = decimal ? Number.parseFloat(text) : Number.parseInt(text, 10);
  if (Number.isNaN(value) || value < min || value > max) return undefined;
  return String(value);
}

type Codec = 'sec' | 'xor' | null;

function detectImageCodec(imageUrl: string): Codec {
  const fileName = imageUrl.split('#')[0]!.split('?')[0]!.split('/').pop() ?? '';
  const dot = fileName.lastIndexOf('.');
  const base = dot >= 0 ? fileName.slice(0, dot) : fileName;
  if (base.length !== IMAGE_NAME_LENGTH) return null;
  const mode = base[IMAGE_MODE_INDEX];
  return mode === 's' ? 'sec' : mode === 'x' ? 'xor' : null;
}

function looksLikeImage(b: Uint8Array): boolean {
  if (b.length < MIN_IMAGE_SIGNATURE_SIZE) return false;
  const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const gif = b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38;
  const webp = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45;
  const avif = b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 && b[8] === 0x61 && b[9] === 0x76;
  return jpeg || png || gif || webp || avif;
}

export abstract class InkStory {
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  abstract readonly serviceName: string;

  headers(): Record<string, string> {
    return {
      // User Agent required by source. Don't change
      'User-Agent': 'Tachiyomi (+https://github.com/keiyoushi/extensions-source)',
      Accept: 'application/json, text/plain, */*',
      'X-Service-Name': this.serviceName,
    };
  }

  preferences(): Preference[] {
    return [
      {
        type: 'select',
        key: PREF_CHAPTER_BRANCH_MODE,
        label: 'Режим веток глав',
        options: [
          { value: 'all', label: 'Все ветки' },
          { value: 'latest', label: 'Последняя версия главы' },
          { value: 'preferred', label: 'Предпочитаемая ветка' },
        ],
        default: 'all',
      },
      {
        type: 'text',
        key: PREF_PREFERRED_BRANCH_QUERY,
        label: 'Предпочитаемая ветка',
        description: 'Используется в режиме "Предпочитаемая ветка" (поиск по части названия команды)',
        default: '',
      },
      {
        type: 'switch',
        key: DELAY_CHAPTERS,
        label: 'Скрывать главы',
        description: 'Включено: главы новее 4 дней скрыты',
        default: false,
      },
    ];
  }

  async api<T>(path: string): Promise<{ body: T; headers: Record<string, string> }> {
    const response = await http.get<T>(`${API_URL}${path}`, { headers: this.headers(), responseType: 'json' });
    return { body: response.body, headers: response.headers };
  }

  mangaSummary(book: BookDto): MangaSummary {
    return {
      url: `/content/${book.slug}`,
      title: resolveTitle(book.name, book.slug),
      thumbnailUrl: book.poster || undefined,
    };
  }

  // ============================== Catalog ===============================
  async makeCatalogRequest(sortBy: string, page: number, query?: string, filters?: FilterState): Promise<MangaPage> {
    const params: [string, string][] = [['serviceName', this.serviceName]];
    let sort = sortBy;
    let order = 'desc';
    if (filters) {
      for (const [id, value] of Object.entries(filters)) {
        if (id.startsWith('genre.')) {
          if (value === 'include') params.push(['labelsInclude', id.slice(6)]);
          else if (value === 'exclude') params.push(['labelsExclude', id.slice(6)]);
        }
      }
      if (filters.strict === true) params.push(['strictLabelEqual', 'true']);
      for (const group of MULTI)
        for (const [value] of group.values)
          if (filters[`${group.id}.${value}`] === true) params.push([group.param, value]);
      for (const range of RANGES) {
        const min = normalizeNumber(filters[`${range.id}Min`], range.from, range.to, range.decimal);
        const max = normalizeNumber(filters[`${range.id}Max`], range.from, range.to, range.decimal);
        if (min) params.push([range.min, min]);
        if (max) params.push([range.max, max]);
      }
      const sorting = filters.order;
      if (sorting && typeof sorting === 'object') {
        sort = sorting.value;
        order = sorting.ascending ? 'asc' : 'desc';
      }
    }
    if (query?.trim()) params.push(['search', query.trim()]);
    params.push(['page', String(Math.max(page - 1, 0))], ['size', String(PAGE_SIZE)], ['sort', `${sort},${order}`]);
    const { body, headers } = await this.api<BookDto[]>(
      `/books?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`,
    );
    const items = body.map((b) => this.mangaSummary(b));
    const total = Number.parseInt(headers['x-estimated-total-hits'] ?? '', 10);
    return { items, hasNextPage: Number.isNaN(total) ? items.length >= PAGE_SIZE : page * PAGE_SIZE < total };
  }

  getPopular(page: number): Promise<MangaPage> {
    return this.makeCatalogRequest('viewsCount', page);
  }

  async getLatest(page: number): Promise<MangaPage> {
    const { body } = await this.api<{ book: BookDto }[]>(
      `/chapter-update-feed?serviceName=${encodeURIComponent(this.serviceName)}&onlyBorderChapters=true&page=${Math.max(page - 1, 0)}&size=${PAGE_SIZE}`,
    );
    const items = body.map((e) => this.mangaSummary(e.book));
    return { items, hasNextPage: items.length >= PAGE_SIZE };
  }

  search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    return this.makeCatalogRequest('viewsCount', page, query, filters);
  }

  // ============================== Filters ===============================
  async getFilters(): Promise<Filter[]> {
    const filters: Filter[] = [
      {
        type: 'sort',
        id: 'order',
        label: 'Сортировать по',
        options: ORDERS.map(([value, label]) => ({ value, label })),
        default: { value: 'viewsCount', ascending: false },
      },
    ];
    try {
      const { body } = await this.api<{ kind: string; name: string; slug: string }[]>('/labels');
      const genres = body.filter((l) => l.kind === 'GENRE');
      if (genres.length) {
        filters.push(
          {
            type: 'group',
            id: 'genres',
            label: 'Жанры',
            filters: genres.map((g): Filter => ({ type: 'tristate', id: `genre.${g.slug}`, label: g.name })),
          },
          { type: 'separator' },
          { type: 'checkbox', id: 'strict', label: 'Строгое совпадение жанров' },
        );
      }
    } catch (error) {
      log.warn('Cannot load genres', error);
    }
    for (const group of MULTI) {
      filters.push({
        type: 'group',
        id: group.id,
        label: group.label,
        filters: group.values.map(([value, label]): Filter => ({
          type: 'checkbox',
          id: `${group.id}.${value}`,
          label,
        })),
      });
    }
    for (const range of RANGES) {
      filters.push(
        { type: 'text', id: `${range.id}Min`, label: `${range.label}: от` },
        { type: 'text', id: `${range.id}Max`, label: `${range.label}: до` },
      );
    }
    return filters;
  }

  // ============================== Details ===============================
  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const slug = /\/content\/([^/#]+)/.exec(manga.url)?.[1] ?? '';
    const { body: m } = await this.api<
      BookDto & {
        description?: string | null;
        status?: string | null;
        labels?: { name?: string | null }[] | null;
        formats?: string[];
        relations?: { type?: string | null; publisher?: Publisher | null }[] | null;
        externalLinks?: string[];
        averageRating?: number | null;
        ratingVotesCount?: number | null;
        viewsCount?: number | null;
        likesCount?: number | null;
        bookmarksCount?: number | null;
      }
    >(`/books/${slug}`);
    const parts: string[] = [];
    const add = (text: string, separator = '\n') => parts.push(parts.length ? separator + text : text);
    if (m.description?.trim()) add(m.description.trim());
    if (m.averageRating != null)
      add(
        `**Рейтинг**: ${m.averageRating.toFixed(2)}${m.ratingVotesCount != null ? ` (оценок: ${m.ratingVotesCount})` : ''}`,
        '\n\n',
      );
    if (m.viewsCount != null) add(`**Просмотры**: ${formatInt(m.viewsCount)}`);
    if (m.likesCount != null) add(`**Лайки**: ${formatInt(m.likesCount)}`);
    if (m.bookmarksCount != null) add(`**Закладки**: ${formatInt(m.bookmarksCount)}`);
    if (m.externalLinks?.length)
      add(
        `**Внешние ссылки**:\n${m.externalLinks
          .map(
            (l) =>
              `- [${l
                .split('://')
                .pop()!
                .split('/')[0]!
                .replace(/^www\./, '')}](${l})`,
          )
          .join('\n')}`,
      );
    const people = (type: string) =>
      [
        ...new Set(
          (m.relations ?? [])
            .filter((r) => r.type === type)
            .map((r) => r.publisher?.name?.trim())
            .filter((n): n is string => !!n),
        ),
      ].join(', ') || undefined;
    const statuses: Record<string, MangaStatus> = { ONGOING: 'ongoing', DONE: 'completed', FROZEN: 'hiatus' };
    return {
      ...this.mangaSummary(m),
      description: parts.join('') || undefined,
      author: people('AUTHOR'),
      artist: people('ARTIST'),
      status: statuses[m.status ?? ''] ?? 'unknown',
      genres: [
        ...(m.labels ?? []).map((l) => l.name?.trim()).filter((n): n is string => !!n),
        ...(m.formats ?? []).map((f) => f.toLowerCase().replace(/_/g, ' ')),
      ],
    };
  }

  // ============================== Chapters ===============================
  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const slug = /\/content\/([^/#]+)/.exec(manga.url)?.[1] ?? '';
    // The chapter api wants the book id, which only the book itself tells.
    const bookId = (await this.api<BookDto>(`/books/${slug}`)).body.id;
    const mode = prefs.get<string>(PREF_CHAPTER_BRANCH_MODE) ?? 'all';
    const delay = prefs.get<boolean>(DELAY_CHAPTERS) ?? false;
    const branches = new Map(
      (
        await this.api<{ id: string; publishers?: Publisher[] }[]>(
          `/branches?bookId=${bookId}&moderationStatus=APPROVED`,
        )
      ).body.map((b) => [
        b.id,
        [...new Set((b.publishers ?? []).map((p) => p.name?.trim()).filter((n): n is string => !!n))].join(', '),
      ]),
    );
    const list = (
      await this.api<
        {
          id: string;
          name?: string | null;
          title?: string | null;
          number?: number | null;
          volume?: number | null;
          branchId?: string | null;
          createdAt?: string | null;
        }[]
      >(`/chapters?bookId=${bookId}&moderationStatus=APPROVED`)
    ).body;
    // Date.now() only filters the result; it is not part of a request.
    const limit = Date.now() - 4 * 86_400_000;
    const data = list
      .map((c): Chapter => {
        const vol = c.volume != null ? String(c.volume).replace(/\.0$/, '') : undefined;
        const num = c.number != null ? String(c.number).replace(/\.0$/, '') : undefined;
        const base = vol && num ? `Том ${vol} Глава ${num}` : num ? `Глава ${num}` : vol ? `Том ${vol}` : 'Глава';
        const subtitle = [c.name, c.title].find((t) => t?.trim())?.trim();
        return {
          url: `/content/${slug}/${c.id}`,
          name: subtitle && base.toLowerCase() !== subtitle.toLowerCase() ? `${base} - ${subtitle}` : base,
          number: c.number ?? undefined,
          scanlator: (c.branchId && branches.get(c.branchId)) || undefined,
          uploadedAt: parseTime(c.createdAt),
        };
      })
      .filter((c) => !delay || !c.uploadedAt || c.uploadedAt <= limit);
    if (mode === 'preferred') {
      const query = (prefs.get<string>(PREF_PREFERRED_BRANCH_QUERY) ?? '').trim().toLowerCase();
      const preferred = query ? data.filter((c) => c.scanlator?.toLowerCase().includes(query)) : data;
      return this.deduplicate(preferred.length ? preferred : data);
    }
    return mode === 'latest' ? this.deduplicate(data) : data;
  }

  /** One chapter per number: the newest upload. */
  deduplicate(chapters: Chapter[]): Chapter[] {
    const latest = new Map<number, Chapter>();
    for (const c of chapters) {
      if ((c.number ?? -1) >= 0) {
        const existing = latest.get(c.number!);
        if (!existing || (c.uploadedAt ?? 0) > (existing.uploadedAt ?? 0)) latest.set(c.number!, c);
      }
    }
    const seen = new Set<number>();
    const result: Chapter[] = [];
    for (const c of chapters) {
      if ((c.number ?? -1) < 0) result.push(c);
      else if (!seen.has(c.number!)) {
        seen.add(c.number!);
        result.push(latest.get(c.number!)!);
      }
    }
    return result;
  }

  // ============================== Pages ===============================
  async getPages(chapter: Chapter): Promise<Page[]> {
    const id = chapter.url.split('/').pop() ?? '';
    const { body } = await this.api<{ pages: { index?: number | null; image?: string | null }[] }>(`/chapters/${id}`);
    return body.pages
      .slice()
      .sort((a, b) => (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER))
      .flatMap((p) => (p.image?.trim() ? [p.image] : []))
      .map((image, index) => ({ index, imageUrl: this.normalizeImageUrl(image) }));
  }

  /** "Secure" images (mode char `s`) are served XOR-encrypted under the `x` name. */
  normalizeImageUrl(imageUrl: string): string {
    if (detectImageCodec(imageUrl) !== 'sec') return imageUrl;
    const slash = imageUrl.lastIndexOf('/');
    const at = slash + 1 + IMAGE_MODE_INDEX;
    return at < imageUrl.length ? `${imageUrl.slice(0, at)}x${imageUrl.slice(at + 1)}` : imageUrl;
  }

  transformImage(page: Page, bytes: Uint8Array): ImageTransform {
    if (detectImageCodec(page.imageUrl ?? '') !== 'xor' || bytes.length < MIN_IMAGE_SIGNATURE_SIZE) return {};
    if (looksLikeImage(bytes)) return {};
    const header = bytes.slice(0, MIN_IMAGE_SIGNATURE_SIZE).map((b, i) => b ^ SECRET_KEY[i % SECRET_KEY.length]!);
    if (!looksLikeImage(header)) return {};
    return { bytes: bytes.map((b, i) => b ^ SECRET_KEY[i % SECRET_KEY.length]!) };
  }

  imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.headers()['User-Agent']! };
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/content\/([^/?#]+)/i.exec(url.trim());
    const host = /^https?:\/\/([^/?#]+)/i.exec(this.baseUrl)?.[1]?.toLowerCase();
    return match && match[1]!.toLowerCase() === host ? { url: `/content/${match[2]}`, title: '' } : null;
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return absoluteUrl(this.baseUrl, item.url.split('#')[0]!);
  }

  toSource(): Source {
    return {
      baseUrl: this.baseUrl,
      getPopular: (page) => this.getPopular(page),
      getLatest: (page) => this.getLatest(page),
      search: (query, page, filters) => this.search(query, page, filters),
      getFilters: () => this.getFilters(),
      getMangaDetails: (manga) => this.getMangaDetails(manga),
      getChapters: (manga) => this.getChapters(manga),
      getPages: (chapter) => this.getPages(chapter),
      transformImage: (page, bytes) => this.transformImage(page, bytes),
      imageHeaders: () => this.imageHeaders(),
      resolveUrl: (url) => this.resolveUrl(url),
      getWebUrl: (item) => this.getWebUrl(item),
    };
  }
}
