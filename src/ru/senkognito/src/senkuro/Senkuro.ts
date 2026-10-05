// Senkuro, ported from keiyoushi/extensions-source lib-multisrc/senkuro. This directory is a template: every
// extension using the theme keeps an identical copy in src/senkuro/ (`node scripts/sync-multisrc.mjs`).
import type {
  Chapter,
  Filter,
  FilterState,
  MangaDetails,
  MangaPage,
  MangaStatus,
  MangaSummary,
  Page,
  Source,
} from '@matane/extension-sdk';
import { absoluteUrl } from './utils';

const OFFSET_COUNT = 10;

const SEARCH_QUERY = `
query searchTachiyomiManga(
  $query: String,
  $type: MangaTachiyomiSearchTypeFilter,
  $status: MangaTachiyomiSearchStatusFilter,
  $rating: MangaTachiyomiSearchRatingFilter,
  $format: MangaTachiyomiSearchFormatFilter,
  $translationStatus: MangaTachiyomiSearchTranslationStatusFilter,
  $label: MangaTachiyomiSearchLabelFilter,
  $orderBy: MangaTachiyomiOrder,
  $offset: Int
) {
  mangaTachiyomiSearch(
    query: $query,
    type: $type,
    status: $status,
    rating: $rating,
    format: $format,
    translationStatus: $translationStatus,
    label: $label,
    orderBy: $orderBy,
    offset: $offset
  ) {
    mangas {
      id
      slug
      originalName { lang content }
      titles { lang content }
      alternativeNames { lang content }
      cover { original { url } }
    }
  }
}`;

const FILTERS_QUERY = `
query fetchTachiyomiSearchFilters {
  mangaTachiyomiSearchFilters {
    labels { id rootId slug titles { lang content } }
  }
}`;

const DETAILS_QUERY = `
query fetchTachiyomiManga($mangaId: ID!) {
  mangaTachiyomiInfo(mangaId: $mangaId) {
    id
    slug
    originalName { lang content }
    titles { lang content }
    alternativeNames { lang content }
    localizations { lang description }
    type
    rating
    status
    formats
    labels { id rootId slug titles { lang content } }
    translationStatus
    cover { original { url } }
    mainStaff { roles person { name } }
  }
}`;

const CHAPTERS_QUERY = `
query fetchTachiyomiChapters($mangaId: ID!) {
  mangaTachiyomiChapters(mangaId: $mangaId) {
    message
    chapters { id slug branchId name teamIds number volume createdAt updatedAt }
    teams { id slug name }
  }
}`;

const PAGES_QUERY = `
query fetchTachiyomiChapterPages($mangaId: ID!, $chapterId: ID!) {
  mangaTachiyomiChapterPages(mangaId: $mangaId, chapterId: $chapterId) {
    pages { url }
  }
}`;

type Title = { lang: string; content: string };
interface Label {
  id: string;
  rootId?: string | null;
  slug: string;
  titles: Title[];
}
interface MangaDto {
  id: string;
  slug: string;
  titles?: Title[] | null;
  alternativeNames?: Title[] | null;
  localizations?: { lang: string; description?: string | null }[] | null;
  type?: string | null;
  status?: string | null;
  rating?: string | null;
  formats?: string[] | null;
  labels?: Label[] | null;
  mainStaff?: { roles: string[]; person: { name: string } }[] | null;
  cover?: { original?: { url: string } | null } | null;
}

const TYPES: [string, string][] = [
  ['MANGA', 'Манга'],
  ['MANHWA', 'Манхва'],
  ['MANHUA', 'Маньхуа'],
  ['COMICS', 'Комикс'],
  ['OEL_MANGA', 'OEL Манга'],
  ['RU_MANGA', 'РуМанга'],
];
const STATUSES: [string, string][] = [
  ['ANNOUNCE', 'Анонс'],
  ['ONGOING', 'Онгоинг'],
  ['FINISHED', 'Выпущено'],
  ['HIATUS', 'Приостановлено'],
  ['CANCELLED', 'Отменено'],
];
const TRANSLATION_STATUSES: [string, string][] = [
  ['IN_PROGRESS', 'Переводится'],
  ['FINISHED', 'Завершён'],
  ['FROZEN', 'Заморожен'],
  ['ABANDONED', 'Заброшен'],
];
const AGES: [string, string][] = [
  ['GENERAL', '0+'],
  ['SENSITIVE', '12+'],
  ['QUESTIONABLE', '16+'],
  ['EXPLICIT', '18+'],
];
const FORMATS: [string, string][] = [
  ['DIGEST', 'Сборник'],
  ['DOUJINSHI', 'Додзинси'],
  ['IN_COLOR', 'В цвете'],
  ['SINGLE', 'Сингл'],
  ['WEB', 'Веб'],
  ['WEBTOON', 'Вебтун'],
  ['YONKOMA', 'Ёнкома'],
  ['SHORT', 'Short'],
];
/** Label groups of the site, by root id. */
const LABEL_ROOTS: [string, string][] = [
  ['TEFCRUw6NQ', 'Темы'],
  ['TEFCRUw6NA', 'Сеттинг'],
  ['TEFCRUw6Ng', 'Элементы'],
  ['TEFCRUw6Mw', 'Черты'],
  ['TEFCRUw6Nw', 'Демография'],
];
const ORDERS: [string, string][] = [
  ['SCORE', 'По рейтингу'],
  ['POPULARITY_SCORE', 'По популярности'],
];

const nameOf = (list: [string, string][], slug?: string | null) => list.find(([id]) => id === slug)?.[1];
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const titleOf = (titles?: Title[] | null) =>
  titles?.find((t) => t.lang === 'RU')?.content ??
  titles?.find((t) => t.lang === 'EN')?.content ??
  titles?.[0]?.content ??
  '';

function parseStatus(status?: string | null): MangaStatus {
  switch (status) {
    case 'FINISHED':
      return 'completed';
    case 'ONGOING':
    case 'ANNOUNCE':
      return 'ongoing';
    case 'HIATUS':
      return 'hiatus';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

export abstract class Senkuro {
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  /** The `App-Id` header differs per site. */
  abstract readonly appId: string;

  get apiUrl(): string {
    return `${this.baseUrl.replace('https://', 'https://api.')}/graphql`;
  }

  headers(): Record<string, string> {
    return {
      'User-Agent': 'Tachiyomi (+https://github.com/keiyoushi/extensions-source)',
      'Content-Type': 'application/json',
      'App-Id': this.appId,
      'App-Version': '060626',
    };
  }

  async graphQL<T>(query: string, variables: unknown): Promise<T> {
    const response = await http.post<{ data?: T; errors?: { message: string }[] }>(
      this.apiUrl,
      { json: { query, variables } },
      { headers: this.headers(), responseType: 'json' },
    );
    const { data, errors } = response.body;
    if (!data) throw new Error(errors?.[0]?.message ?? 'Empty GraphQL response');
    return data;
  }

  // Manga url: /manga/<slug>#<id>; chapter url: /manga/<slug>/chapters/<slug>#<manga id>,<chapter id>.
  mangaSummary(m: { id: string; slug: string; titles?: Title[] | null; cover?: MangaDto['cover'] }): MangaSummary {
    return { url: `/manga/${m.slug}#${m.id}`, title: titleOf(m.titles), thumbnailUrl: m.cover?.original?.url };
  }

  async searchRequest(variables: Record<string, unknown>): Promise<MangaPage> {
    const data = await this.graphQL<{ mangaTachiyomiSearch: { mangas: MangaDto[] } }>(SEARCH_QUERY, variables);
    const items = data.mangaTachiyomiSearch.mangas.map((m) => this.mangaSummary(m));
    return { items, hasNextPage: items.length >= OFFSET_COUNT };
  }

  getPopular(page: number): Promise<MangaPage> {
    return this.searchRequest({
      orderBy: { direction: 'DESC', field: 'POPULARITY_SCORE' },
      offset: (page - 1) * OFFSET_COUNT,
    });
  }

  search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const pick = (prefix: string) => {
      const include: string[] = [];
      const exclude: string[] = [];
      for (const [id, value] of Object.entries(filters)) {
        if (!id.startsWith(`${prefix}.`)) continue;
        if (value === 'include') include.push(id.slice(prefix.length + 1));
        else if (value === 'exclude') exclude.push(id.slice(prefix.length + 1));
      }
      return include.length || exclude.length ? { include, exclude } : undefined;
    };
    const order = typeof filters.order === 'object' ? filters.order : { value: 'POPULARITY_SCORE', ascending: false };
    return this.searchRequest({
      query: query.trim() || undefined,
      type: pick('type'),
      status: pick('status'),
      rating: pick('age'),
      format: pick('format'),
      translationStatus: pick('tstatus'),
      label: pick('label'),
      orderBy: { direction: order.ascending ? 'ASC' : 'DESC', field: order.value },
      offset: (page - 1) * OFFSET_COUNT,
    });
  }

  async getFilters(): Promise<Filter[]> {
    const tri = (prefix: string, label: string, list: [string, string][]): Filter => ({
      type: 'group',
      id: prefix,
      label,
      filters: list.map(([id, name]): Filter => ({ type: 'tristate', id: `${prefix}.${id}`, label: name })),
    });
    const filters: Filter[] = [
      {
        type: 'sort',
        id: 'order',
        label: 'Сортировка',
        options: ORDERS.map(([value, label]) => ({ value, label })),
        default: { value: 'POPULARITY_SCORE', ascending: false },
      },
      tri('type', 'Тип', TYPES),
      tri('format', 'Формат', FORMATS),
      tri('status', 'Статус', STATUSES),
      tri('tstatus', 'Статус перевода', TRANSLATION_STATUSES),
      tri('age', 'Возрастное ограничение', AGES),
    ];
    try {
      const data = await this.graphQL<{ mangaTachiyomiSearchFilters: { labels: Label[] } }>(FILTERS_QUERY, {});
      const labels = data.mangaTachiyomiSearchFilters.labels
        .map((l): [string, string, string] => [
          l.slug,
          capitalize(l.titles.find((t) => t.lang === 'RU')?.content ?? l.slug),
          l.rootId ?? '',
        ])
        .sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
      for (const [root, title] of LABEL_ROOTS) {
        const group = labels.filter((l) => l[2] === root).map((l): [string, string] => [l[0], l[1]]);
        if (group.length) {
          // All label groups share one request field, so the ids carry the same prefix.
          filters.push({
            type: 'group',
            id: `labels-${root}`,
            label: title,
            filters: group.map(([id, name]): Filter => ({ type: 'tristate', id: `label.${id}`, label: name })),
          });
        }
      }
    } catch (error) {
      log.warn('Cannot load filters', error);
    }
    return filters;
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const id = manga.url.split('#')[1] ?? '';
    const data = await this.graphQL<{ mangaTachiyomiInfo?: MangaDto | null }>(DETAILS_QUERY, { mangaId: id });
    const m = data.mangaTachiyomiInfo;
    if (!m) throw new Error('Manga not found');
    const staff = (roles: string[]) =>
      m.mainStaff
        ?.filter((s) => s.roles.some((r) => roles.includes(r)))
        .map((s) => s.person.name)
        .join(', ') || undefined;
    const alt = m.alternativeNames?.map((n) => n.content).join(' / ');
    const genres = [
      nameOf(TYPES, m.type),
      nameOf(AGES, m.rating),
      m.formats
        ?.map((f) => nameOf(FORMATS, f))
        .filter(Boolean)
        .join(', '),
      m.labels?.map((l) => l.titles.find((t) => t.lang === 'RU')?.content ?? '').join(', '),
    ]
      .filter(Boolean)
      .join(', ')
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean)
      .map(capitalize);
    return {
      ...this.mangaSummary(m),
      author: staff(['STORY', 'STORY_AND_ART', 'ORIGINAL_CREATOR']),
      artist: staff(['ART', 'STORY_AND_ART']),
      description:
        `${alt ? `Альтернативные названия:\n${alt}\n\n` : ''}${m.localizations?.find((l) => l.lang === 'RU')?.description ?? ''}`.trim() ||
        undefined,
      genres,
      status: parseStatus(m.status),
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const mangaId = manga.url.split('#')[1] ?? '';
    const slug = /\/manga\/([^/#]+)/.exec(manga.url)?.[1] ?? '';
    const data = await this.graphQL<{
      mangaTachiyomiChapters: {
        chapters: {
          id: string;
          slug: string;
          name?: string | null;
          number: string;
          volume: string;
          teamIds: string[];
          createdAt?: string | null;
          updatedAt?: string | null;
        }[];
        teams: { id: string; name: string }[];
      };
    }>(CHAPTERS_QUERY, { mangaId });
    const teams = new Map(data.mangaTachiyomiChapters.teams.map((t) => [t.id, t.name]));
    return data.mangaTachiyomiChapters.chapters.map((c): Chapter => {
      // API timestamps are UTC and may omit the offset.
      const date = c.updatedAt ?? c.createdAt;
      const time = date ? Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(date) ? date : `${date}Z`) : Number.NaN;
      return {
        url: `/manga/${slug}/chapters/${c.slug}#${mangaId},${c.id}`,
        name: `${c.volume}. Глава ${c.number} ${c.name ?? ''}`.trim(),
        number: Number.parseFloat(c.number) || undefined,
        scanlator:
          c.teamIds
            .map((t) => teams.get(t))
            .filter(Boolean)
            .join(', ') || undefined,
        uploadedAt: Number.isNaN(time) ? undefined : time,
      };
    });
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const [mangaId = '', chapterId = ''] = (chapter.url.split('#')[1] ?? '').split(',');
    const data = await this.graphQL<{ mangaTachiyomiChapterPages: { pages: { url: string }[] } }>(PAGES_QUERY, {
      mangaId,
      chapterId,
    });
    return data.mangaTachiyomiChapterPages.pages.map((p, index) => ({ index, imageUrl: p.url }));
  }

  imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.headers()['User-Agent']! };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return absoluteUrl(this.baseUrl, item.url.split('#')[0]!);
  }

  toSource(): Source {
    return {
      baseUrl: this.baseUrl,
      getPopular: (page) => this.getPopular(page),
      search: (query, page, filters) => this.search(query, page, filters),
      getFilters: () => this.getFilters(),
      getMangaDetails: (manga) => this.getMangaDetails(manga),
      getChapters: (manga) => this.getChapters(manga),
      getPages: (chapter) => this.getPages(chapter),
      imageHeaders: () => this.imageHeaders(),
      getWebUrl: (item) => this.getWebUrl(item),
    };
  }
}
