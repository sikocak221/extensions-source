// GroupLe, ported from keiyoushi/extensions-source lib-multisrc/grouple. This directory is a template: every
// extension using the theme keeps an identical copy in src/grouple/ (`node scripts/sync-multisrc.mjs`).
//
// Not ported: the automatic login (it needs the site's cookie jar and redirect handling; WebView-less login is
// not possible in the sandbox) and "related manga". Chapters the site hides from anonymous users stay hidden.
import type {
  Chapter,
  Filter,
  FilterState,
  HtmlElement,
  MangaDetails,
  MangaPage,
  MangaStatus,
  MangaSummary,
  Page,
  Preference,
  Source,
} from '@matane/extension-sdk';
import { absoluteUrl, decodeEntities, hostOf, parseDate, relativeUrl } from './utils';

export const UAGENT_PREF = 'user_agent';
const UAGENT_DEFAULT = 'arora';

export interface FilterData {
  sortType?: [label: string, value: string][];
  productionStatus?: [string, string][];
  translationStatus?: [string, string][];
  searchFilters?: [string, string][];
  genre?: [string, string][];
  category?: [string, string][];
  limitation?: [string, string][];
  another?: [string, string][];
  tags?: [string, string][];
  years?: { min?: number; max?: number };
}

const USER_HASH_REGEX = /user_hash.+'(.+)'/;
const EXTRA_REGEX = /\s*([0-9]+\sЭкстра)\s*/;
const SINGLE_REGEX = /\s*Сингл\s*/;
const FILTERS_REGEX = /window\.__FILTERS\.(\w+)\s*=\s*([{].*?[}]);/g;
const PAGES_REGEX = /\[['"](.*?)['"],['"](.*?)['"],['"](.*?)['"].*?\]/g;
const BLOCKED_ANON_REGEX = /\{[^{}]*?['"]blockedForAnonymous['"][^{}]*?\}/;
const ALLOW_ANONYMOUS_REGEX = /enabled:\s*true/;

/** Group id → request parameter names (include, exclude). */
const GROUPS: { id: keyof FilterData; label: string; include: string; exclude: string }[] = [
  { id: 'genre', label: 'Жанры', include: 'includeElementIds', exclude: 'excludeElementIds' },
  { id: 'tags', label: 'Теги', include: 'includeElementIds', exclude: 'excludeElementIds' },
  { id: 'category', label: 'Категории', include: 'includeElementIds', exclude: 'excludeElementIds' },
  {
    id: 'productionStatus',
    label: 'Статус выхода',
    include: 'includeProductionStatuses',
    exclude: 'excludeProductionStatuses',
  },
  {
    id: 'translationStatus',
    label: 'Статус перевода',
    include: 'includeTranslationStatuses',
    exclude: 'excludeTranslationStatuses',
  },
  { id: 'limitation', label: 'Возрастная рекомендация', include: 'includeElementIds', exclude: 'excludeElementIds' },
  { id: 'another', label: 'Прочее', include: 'includeElementIds', exclude: 'excludeElementIds' },
  { id: 'searchFilters', label: 'Фильтры', include: 'includeSearchFilter', exclude: 'excludeSearchFilter' },
];

export function ratingToStars(rating: number): string {
  if (rating > 9.5) return '★★★★★';
  if (rating > 8.5) return '★★★★✬';
  if (rating > 7.5) return '★★★★☆';
  if (rating > 6.5) return '★★★✬☆';
  if (rating > 5.5) return '★★★☆☆';
  if (rating > 4.5) return '★★✬☆☆';
  if (rating > 3.5) return '★★☆☆☆';
  if (rating > 2.5) return '★✬☆☆☆';
  if (rating > 1.5) return '★☆☆☆☆';
  if (rating > 0.5) return '✬☆☆☆☆';
  return '☆☆☆☆☆';
}

export function normalizeAgeRating(raw: string): string {
  if (raw === 'NC-17' || raw === 'R18+') return '18+';
  if (raw === 'R' || raw === 'G' || raw === 'PG') return '16+';
  if (raw === 'PG-13') return '12+';
  return raw;
}

const formatNumber = (n: number) => String(Math.round(n * 100) / 100);

export abstract class GroupLe {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  tagsSelector =
    '.creation-element-tags .creation-element-tags__item:not(.creation-element-tags__item--misc) span:not(.text-secondary)';
  defaultSortOrder = 'RATING';

  userAgent(): string {
    return prefs.get<string>(UAGENT_PREF) || UAGENT_DEFAULT;
  }

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent(), Referer: `${this.baseUrl}/` };
  }

  apiHeaders(): Record<string, string> {
    return {
      ...this.headers(),
      Accept: 'application/json, text/plain, */*',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
    };
  }

  preferences(): Preference[] {
    return [
      {
        type: 'text',
        key: UAGENT_PREF,
        label: 'User-Agent (для некоторых стран)',
        description: 'Для смены User-Agent может понадобиться перезапуск приложения',
        default: UAGENT_DEFAULT,
      },
    ];
  }

  async fetchDocument(url: string): Promise<HtmlElement> {
    const response = await http.get(url, { headers: this.headers() });
    this.checkRedirect(url, response.url);
    return html.load(response.body, { baseUrl: response.url });
  }

  /** The site moves series between domains; a request that ends up elsewhere is a stale url. */
  checkRedirect(requested: string, final: string): void {
    if (hostOf(requested) === hostOf(this.baseUrl) && hostOf(final) !== hostOf(this.baseUrl)) {
      if (requested.includes('api/catalog')) throw new Error('Смените домен расширения');
      throw new Error(`URL серии изменился. Перенесите мангу на другое расширение GroupLe (${final})`);
    }
  }

  // ============================== Search ===============================
  async makeSearchRequest(sortBy: string, page: number, query?: string, filters?: FilterState): Promise<MangaPage> {
    const params: [string, string][] = [['offset', String(50 * (page - 1))]];
    if (query?.trim()) params.push(['q', query.trim()]);
    if (filters) {
      const order = filters.order;
      params.push(['sortType', typeof order === 'string' && order ? order : sortBy]);
      for (const group of GROUPS) {
        for (const [id, value] of Object.entries(filters)) {
          if (!id.startsWith(`${group.id}.`)) continue;
          if (value === 'include') params.push([group.include, id.slice(group.id.length + 1)]);
          else if (value === 'exclude') params.push([group.exclude, id.slice(group.id.length + 1)]);
        }
      }
      const from = typeof filters.yearFrom === 'string' ? filters.yearFrom.trim() : '';
      const to = typeof filters.yearTo === 'string' ? filters.yearTo.trim() : '';
      if (from || to) params.push(['years', `${from || 1950},${to || new Date().getFullYear()}`]);
    } else {
      params.push(['sortType', sortBy]);
    }
    const url = `${this.baseUrl}/api/catalog/search?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
    const response = await http.get<{
      total: number;
      offset: number;
      limit: number;
      list: { name: string; picUrl?: string | null; elementId: { linkName: string } }[];
    }>(url, { headers: this.apiHeaders(), responseType: 'json' });
    this.checkRedirect(url, response.url);
    const result = response.body;
    return {
      items: result.list.map((m): MangaSummary => ({
        url: `/${m.elementId.linkName}`,
        title: m.name,
        thumbnailUrl: m.picUrl || undefined,
      })),
      hasNextPage: result.offset + result.limit < result.total,
    };
  }

  getPopular(page: number): Promise<MangaPage> {
    return this.makeSearchRequest('RATING', page);
  }

  getLatest(page: number): Promise<MangaPage> {
    return this.makeSearchRequest('DATE_UPDATE', page);
  }

  search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    return this.makeSearchRequest(this.defaultSortOrder, page, query, filters);
  }

  // ============================== Filters ===============================
  async fetchFilterData(): Promise<FilterData> {
    const [page, tags] = await Promise.all([
      http.get(`${this.baseUrl}/search/advanced`, { headers: this.headers() }),
      http.get<{ results?: { text: string; id: string }[] }>(`${this.baseUrl}/api/catalog/elementsByType?type=40`, {
        headers: this.apiHeaders(),
        responseType: 'json',
      }),
    ]);
    const found: Record<string, string> = {};
    for (const match of page.body.matchAll(FILTERS_REGEX)) found[match[1]!] = match[2]!;
    if (Object.keys(found).length === 0) throw new Error('Не удалось найти данные о фильтрах');
    const pairs = (key: string): [string, string][] | undefined =>
      found[key]
        ? Object.entries(JSON.parse(found[key]!) as Record<string, string>).map(([id, label]) => [label, id])
        : undefined;
    return {
      sortType: pairs('sortType'),
      productionStatus: pairs('productionStatus'),
      translationStatus: pairs('translationStatus'),
      searchFilters: pairs('searchFilters'),
      genre: pairs('genre'),
      category: pairs('category'),
      limitation: pairs('limitation'),
      another: pairs('another'),
      tags: tags.body.results?.map((t): [string, string] => [t.text, t.id]),
      years: found.years ? (JSON.parse(found.years.replace(/(\w+)\s*:/g, '"$1":')) as FilterData['years']) : undefined,
    };
  }

  filtersFromData(data: FilterData): Filter[] {
    const filters: Filter[] = [];
    if (data.sortType?.length) {
      filters.push({
        type: 'select',
        id: 'order',
        label: 'Сортировать по',
        options: data.sortType.map(([label, value]) => ({ label, value })),
        default: data.sortType.some(([, value]) => value === this.defaultSortOrder)
          ? this.defaultSortOrder
          : data.sortType[0]![1],
      });
    }
    for (const group of GROUPS) {
      const options = data[group.id] as [string, string][] | undefined;
      if (options?.length) {
        filters.push({
          type: 'group',
          id: group.id,
          label: group.label,
          filters: options.map(([label, value]): Filter => ({ type: 'tristate', id: `${group.id}.${value}`, label })),
        });
      }
    }
    if (data.years) {
      filters.push(
        {
          type: 'text',
          id: 'yearFrom',
          label: `Год выпуска: от ${data.years.min ?? 1950}`,
          placeholder: String(data.years.min ?? 1950),
        },
        {
          type: 'text',
          id: 'yearTo',
          label: `Год выпуска: до ${data.years.max ?? new Date().getFullYear()}`,
          placeholder: String(data.years.max ?? new Date().getFullYear()),
        },
      );
    }
    return filters;
  }

  async getFilters(): Promise<Filter[]> {
    try {
      return this.filtersFromData(await this.fetchFilterData());
    } catch (error) {
      log.warn('Cannot load filters', error);
      return [];
    }
  }

  // ============================== Details ===============================
  parseStatus(release: string, translation: string): MangaStatus {
    if (release.includes('продолж') || release.includes('начат')) return 'ongoing';
    if (release.includes('заверш')) return translation.includes('заверш') ? 'completed' : 'ongoing';
    if (release.includes('приост') || release.includes('заморож')) return 'hiatus';
    return 'unknown';
  }

  parseMangaDetails(document: HtmlElement, mangaUrl: string): MangaDetails {
    const title =
      document.selectFirst('.cr-hero-names__main')?.text() ||
      document.selectFirst('meta[itemprop=name]')?.attr('content') ||
      '';

    const details = new Map<string, string>();
    for (const item of document.select('.cr-hero .cr-info-details > *')) {
      const key = item.selectFirst('.cr-info-details-item__title')?.text().toLowerCase() ?? '';
      const value = item.selectFirst('.cr-info-details-item__status')?.text().toLowerCase() ?? '';
      if (key && value && !details.has(key)) details.set(key, value);
    }

    const authors: string[] = [];
    const artists: string[] = [];
    for (const person of document.select('.cr-main-person-item')) {
      const role = person.selectFirst('.cr-main-person-item__role')?.text().toLowerCase() ?? '';
      const names = person.select('.cr-main-person-item__name a, .cr-main-person-item__name').map((e) => e.text());
      if (names.length === 0) continue;
      if (role.includes('автор') || role.includes('сценар')) authors.push(...names);
      else if (role.includes('худож') || role.includes('иллюст')) artists.push(...names);
    }

    const category = document.selectFirst('.cr-hero-short-details a[href*="/list/category/"]')?.text() ?? '';
    const age = normalizeAgeRating(
      document.selectFirst('.cr-hero-short-details a[href*="/list/limitation/"]')?.text() ?? '',
    );
    const tags = document.select(this.tagsSelector).map((e) => e.text());
    const genres = [...new Set([category, age, ...tags].filter((g) => g.trim()).map((g) => g.toLowerCase()))];

    const altNames = [
      ...new Set(
        document
          .select('#alt-names-dialog .modal-body .py-1')
          .map((e) => e.text())
          .filter(Boolean),
      ),
    ];
    const rating = Number.parseFloat(document.selectFirst('.cr-hero-rating .cr-hero-rating__value')?.text() ?? '');
    const votes = (document.selectFirst('.cr-hero-rating__text')?.text() ?? '').replace(/\D/g, '') || '0';
    const parts: string[] = [];
    if (!Number.isNaN(rating)) parts.push(`${ratingToStars(rating)} ${rating} (голосов: ${votes})`);
    const description = document.selectFirst('.cr-description__content')?.text();
    if (description) parts.push(description);
    if (altNames.length) parts.push(`**Альтернативные названия**:\n${altNames.map((n) => `- ${n}`).join('\n')}`);

    const thumb = document.selectFirst('.cr-hero-poster__img') ?? document.selectFirst('.cr-hero-overlay__bg');
    const thumbnailUrl = thumb
      ? ['src', 'data-src', 'data-original', 'data-bg'].map((a) => thumb.absUrl(a)).find(Boolean) || undefined
      : undefined;

    return {
      url: mangaUrl,
      title,
      author: [...new Set(authors)].join(', ') || undefined,
      artist: [...new Set(artists)].join(', ') || undefined,
      description: parts.join('\n') || undefined,
      genres,
      status: this.parseStatus(details.get('выпуск') ?? '', details.get('перевод') ?? ''),
      thumbnailUrl,
    };
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url));
    return this.parseMangaDetails(document, manga.url);
  }

  // ============================== Chapters ===============================
  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url));
    const title = this.parseMangaDetails(document, manga.url).title || manga.title;
    const chapters = await this.parseChapterList(document, title);
    // The page still lists chapters it hides from guests (the hiding is done by the site's scripts), so the
    // login check only matters when nothing is listed.
    if (chapters.length === 0) this.authGuard(document);
    return chapters;
  }

  async chapterSearchParams(document: HtmlElement): Promise<string> {
    const script = document.select('script').find((s) => s.html().includes('user_hash'));
    const hash = script ? USER_HASH_REGEX.exec(script.html())?.[1] : undefined;
    if (!hash) return '?mtr=true';
    await storage.set('user_hash', hash);
    return `?d=${hash}&mtr=true`;
  }

  chapterScanlator(title: string): string {
    return title
      .replace('(Переводчик),', '&')
      .replace('Переводчик,', '&')
      .replace(/ \(Переводчик\)$/, '')
      .replace(/ Переводчик$/, '');
  }

  async parseChapterList(document: HtmlElement, mangaTitle: string): Promise<Chapter[]> {
    const params = await this.chapterSearchParams(document);
    if (
      document
        .select('.alert.alert-warning')
        .some((e) => e.text().includes('Запрещена публикация произведения по копирайту'))
    )
      throw new Error('Лицензировано - Главы удалены по требованию правообладателя.');

    const chapters: Chapter[] = [];
    let seen = 0;
    // Long lists (500+ rows) would blow the 2 s budget with a bridge call per field, so each row is read from
    // its html: a link cell and a date cell that is not a "coming soon" one (Kotlin: `:has(td > a):has(td.date:not(.text-info))`).
    for (const row of document.select('tr.item-row')) {
      if (++seen % 100 === 0) await timers.sleep(0);
      const rowHtml = row.html();
      const link = /<a\s[^>]*class="[^"]*\bchapter-link\b[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(rowHtml);
      const num = /\bdata-num="([^"]*)"/.exec(rowHtml)?.[1];
      const dateCells = [...rowHtml.matchAll(/<td\s[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/td>/g)].filter(
        (m) => /\bdate\b/.test(m[1]!) && !/\btext-info\b/.test(m[1]!),
      );
      if (!link || num === undefined || dateCells.length === 0) continue;
      const attr = (name: string) =>
        decodeEntities(new RegExp(`\\b${name}="([^"]*)"`).exec(link[0].split('>')[0]!)?.[1] ?? '');
      const href = attr('href');
      const number = Number.parseFloat(num) / 10;

      // Own text: child elements (badges) are not part of the title.
      let name = decodeEntities(link[1]!.replace(/<(\w+)\b[^>]*>[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, ''))
        .replace(/\s+/g, ' ')
        .trim();
      if (mangaTitle.length > 25) {
        for (const word of mangaTitle.split(' ')) if (name.startsWith(word)) name = name.slice(word.length).trim();
      }
      const dots = name.indexOf('…');
      const firstDigit = name.search(/[0-9]/);
      if (dots >= 0 && dots < Math.max(firstDigit, 0)) name = name.slice(dots + 1).trim();

      if (EXTRA_REGEX.test(name)) {
        if (!name.slice(name.indexOf('Экстра') + 'Экстра'.length).trim())
          name = name.replace(' ', ` - ${formatNumber(number)} `);
      } else if (SINGLE_REGEX.test(name)) {
        if (!name.slice(name.indexOf('Сингл') + 'Сингл'.length).trim()) name = `${formatNumber(number)} ${name}`;
      }

      const dates = [...rowHtml.matchAll(/<td\s[^>]*class="[^"]*\bd-none\b[^"]*"[^>]*>([\s\S]*?)<\/td>/g)];
      chapters.push({
        url: `${relativeUrl(absoluteUrl(this.baseUrl, href))}${params}`,
        name,
        number: Number.isNaN(number) ? undefined : number,
        scanlator: this.chapterScanlator(attr('title')) || undefined,
        uploadedAt: parseDate(
          decodeEntities(dates[dates.length - 1]?.[1]?.replace(/<[^>]+>/g, '') ?? '').trim(),
          'dd.MM.yy',
        ),
      });
    }
    return chapters;
  }

  authGuard(document: HtmlElement): void {
    const script = document.select('script').find((s) => s.html().includes('viewSettings'));
    if (!script) return;
    const blocked = BLOCKED_ANON_REGEX.exec(script.html())?.[0];
    const isBlocked = blocked ? ALLOW_ANONYMOUS_REGEX.test(blocked) : false;
    if (isBlocked && !document.select('script').some((s) => s.html().includes('window.current_user_id')))
      throw new Error('Для просмотра контента необходима авторизация (расширение не поддерживает вход)');
  }

  // ============================== Pages ===============================
  async getPages(chapter: Chapter): Promise<Page[]> {
    let url = absoluteUrl(this.baseUrl, chapter.url);
    // The user hash is mandatory for chapters that need a login; chapters saved without it get the last one seen.
    const saved = await storage.get<string>('user_hash');
    if (saved && !/[?&]d=/.test(url)) url += `${url.includes('?') ? '&' : '?'}d=${saved}`;
    const response = await http.request<string>({ url, headers: this.headers() });
    if (response.status === 404)
      throw new Error('Для просмотра главы необходима авторизация (Ошибка 404). Расширение не поддерживает вход.');
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
    if (hostOf(response.url) !== hostOf(this.baseUrl))
      throw new Error(`Не удалось загрузить главу. Url: ${response.url}`);
    const document = html.load(response.body, { baseUrl: response.url });

    if (document.selectFirst('div.alert') || document.selectFirst('form.purchase-form'))
      throw new Error('Эта глава платная. Используйте сайт, чтобы купить и прочитать ее.');
    if (document.select('h1').some((h) => h.text().includes('требуется премиум')))
      throw new Error('Для доступа к главе требуется премиум-подписка.');

    const script = document
      .select('script')
      .map((s) => s.html())
      .find((s) => s.includes('chapterInfo'));
    const mark = ['rm_h.readerInit(', 'rm_h.readerDoInit('].find((m) => script?.includes(m));
    if (!script || !mark)
      throw new Error('Дизайн сайта обновлен, для дальнейшей работы необходимо обновление дополнения');
    const begin = script.indexOf(mark);
    const trimmed = script.slice(begin, script.indexOf(');', begin));

    const pages: Page[] = [];
    for (const match of trimmed.matchAll(PAGES_REGEX)) {
      const [, host = '', middle = '', end = ''] = match;
      let imageUrl: string;
      if (!middle.trim() && end.startsWith('/static/')) imageUrl = this.baseUrl + end;
      else imageUrl = middle.endsWith('/manga/') ? host + end : middle + host + end;
      if (!imageUrl.includes('://')) imageUrl = `https:${imageUrl}`;
      if (imageUrl.includes('one-way.work')) imageUrl = imageUrl.split('?')[0]!;
      pages.push({ index: pages.length, imageUrl: imageUrl.replace('//resh', '//h') });
    }
    return pages;
  }

  imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.userAgent(), Referer: `${this.baseUrl}/` };
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/([^/?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: `/${match[2]}`, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return absoluteUrl(this.baseUrl, item.url);
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
      imageHeaders: () => this.imageHeaders(),
      resolveUrl: (url) => this.resolveUrl(url),
      getWebUrl: (item) => this.getWebUrl(item),
    };
  }
}
