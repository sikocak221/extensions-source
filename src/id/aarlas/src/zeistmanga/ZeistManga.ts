// ZeistManga (Blogger sites), ported from keiyoushi/extensions-source lib-multisrc/zeistmanga.
// This file is a template: every extension using the theme keeps an identical copy in src/zeistmanga/
// (`node scripts/sync-multisrc.mjs` refreshes the copies) and overrides members in a subclass, like the
// Kotlin extensions do.
import type {
  Chapter,
  Filter,
  FilterOption,
  FilterState,
  HtmlElement,
  MangaDetails,
  MangaPage,
  MangaStatus,
  MangaSummary,
  Page,
  Source,
} from '@matane/extension-sdk';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

const MAX_MANGA_RESULTS = 20;
const MAX_CHAPTER_RESULTS = 150;
const CHAPTER_CHUNK = 50;

export interface ZeistText {
  $t: string;
}

export interface ZeistEntry {
  title?: ZeistText;
  published?: ZeistText;
  updated?: ZeistText;
  category?: { term: string }[];
  link?: { rel: string; href: string }[];
  content?: ZeistText;
  media$thumbnail?: { url: string };
}

export interface ZeistFeed {
  feed?: {
    openSearch$totalResults?: ZeistText;
    openSearch$itemsPerPage?: ZeistText;
    category?: { term: string }[];
    entry?: ZeistEntry[];
  };
}

export abstract class ZeistManga {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  mangaCategory = 'Series';
  supportsLatest = true;
  userAgent = USER_AGENT;

  /** `<baseUrl>/feeds/posts/default/-/<feed>?alt=json` */
  apiUrl(feed: string = this.mangaCategory): string {
    const path = feed
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `${this.baseUrl}/feeds/posts/default/-/${path}?alt=json`;
  }

  // Popular
  popularMangaUrl(_page: number): string {
    return this.baseUrl;
  }

  popularMangaSelector = 'div.PopularPosts div.grid > figure';
  popularMangaSelectorTitle = 'figcaption > a';
  popularMangaSelectorUrl = 'figcaption > a';

  async getPopular(page: number): Promise<MangaPage> {
    if (!this.supportsLatest) return this.getLatest(page);
    const popular = this.parsePopularManga(await this.fetchDocument(this.popularMangaUrl(page)));
    // Some sites hide the popular widget (e.g. a "taking a break" home page): fall back to the feed.
    return popular.items.length > 0 ? popular : this.getLatest(page);
  }

  parsePopularManga(document: HtmlElement): MangaPage {
    const items = document
      .select(this.popularMangaSelector)
      .map((element) => {
        const img = element.selectFirst('img');
        return {
          url: this.toRelative(element.selectFirst(this.popularMangaSelectorUrl)?.attr('href') ?? ''),
          title: element.selectFirst(this.popularMangaSelectorTitle)?.text() ?? '',
          thumbnailUrl: img?.absUrl('src') || img?.attr('src') || undefined,
        };
      })
      .filter((manga) => manga.url && manga.title);
    return { items, hasNextPage: false };
  }

  // Latest
  latestUpdatesUrl(page: number, orderBy = 'published'): string {
    const startIndex = MAX_MANGA_RESULTS * (page - 1) + 1;
    return withQuery(this.apiUrl(), {
      orderby: orderBy,
      'max-results': String(MAX_MANGA_RESULTS + 1),
      'start-index': String(startIndex),
    });
  }

  async getLatest(page: number): Promise<MangaPage> {
    return this.parseSearchManga(await this.fetchJson<ZeistFeed>(this.latestUpdatesUrl(page)));
  }

  // Search
  searchMangaUrl(_page: number, _query: string): string {
    return this.apiUrl();
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const startIndex = MAX_MANGA_RESULTS * (page - 1) + 1;
    let url = this.searchMangaUrl(page, query);
    if (query.trim()) {
      url = withQuery(url, {
        q: `label:${this.mangaCategory} ${query.trim()}`,
        'max-results': String(MAX_MANGA_RESULTS + 1),
        'start-index': String(startIndex),
      });
    } else {
      const segments: string[] = [];
      for (const id of ['status', 'type', 'language']) {
        const value = filters[id];
        if (typeof value === 'string' && value) segments.push(value);
      }
      for (const [id, value] of Object.entries(filters)) {
        if (id.startsWith('genre.') && value === true) segments.push(id.slice('genre.'.length));
      }
      if (segments.length > 0) {
        const [path, search] = url.split('?');
        url = `${path}/${segments.map((s) => encodeURIComponent(s)).join('/')}?${search}`;
      }
      url = withQuery(url, { 'max-results': String(MAX_MANGA_RESULTS + 1), 'start-index': String(startIndex) });
    }
    return this.parseSearchManga(await this.fetchJson<ZeistFeed>(url));
  }

  excludedCategories = ['Anime', 'Novel', 'Novela'];

  parseSearchManga(result: ZeistFeed): MangaPage {
    const items = (result.feed?.entry ?? [])
      .filter((entry) => entry.category?.some((c) => c.term === this.mangaCategory))
      .filter((entry) => !entry.category?.some((c) => this.excludedCategories.includes(c.term)))
      .map((entry) => this.entryToManga(entry));
    if (items.length === MAX_MANGA_RESULTS + 1) return { items: items.slice(0, -1), hasNextPage: true };
    return { items, hasNextPage: false };
  }

  entryToManga(entry: ZeistEntry): MangaSummary {
    let thumbnailUrl: string | undefined;
    if (entry.media$thumbnail?.url) {
      thumbnailUrl = entry.media$thumbnail.url.replace(/\/s.+?-c\//, '/w600/').replace(/=s(?!.*=s).+?-c$/, '=w600');
    } else if (entry.content?.$t) {
      thumbnailUrl = html.load(entry.content.$t).selectFirst('img')?.attr('src') ?? undefined;
    }
    return { url: this.entryUrl(entry), title: entry.title?.$t ?? '', thumbnailUrl };
  }

  entryToChapter(entry: ZeistEntry, uploadedAt?: number): Chapter {
    return { url: this.entryUrl(entry), name: entry.title?.$t ?? '', uploadedAt };
  }

  entryUrl(entry: ZeistEntry): string {
    const href = entry.link?.find((link) => link.rel === 'alternate')?.href ?? '';
    return this.toRelative(href);
  }

  // Details
  statusSelectorList = ['Status', 'Estado', 'الحالة'];
  authorSelectorList = ['Author', 'Autor', 'Mangaka', 'الكاتب', 'Yazar'];
  artisSelectorList = ['Artist', 'Artista', 'الرسام', 'Çizer'];

  mangaDetailsSelector = '.grid.gtc-235fr';
  mangaDetailsSelectorThumbnail = 'img';
  mangaDetailsSelectorDescription = '#synopsis';
  mangaDetailsSelectorGenres = 'div.mt-15 > a[rel=tag]';
  mangaDetailsSelectorAuthor = 'span#author';
  mangaDetailsSelectorArtist = 'span#artist';
  mangaDetailsSelectorAltName = 'header > p';
  mangaDetailsSelectorStatus = 'span[data-status]';
  mangaDetailsSelectorInfo = '.y6x11p';
  mangaDetailsSelectorInfoTitle = 'strong';
  mangaDetailsSelectorInfoDescription = 'span.dt';
  altNamePrefix = 'Alternative Names: ';

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const document = await this.fetchDocument(this.absolute(manga.url));
    const details = this.mangaDetailsParse(document, manga);
    if (!details.title) {
      details.title =
        document.selectFirst("meta[property='og:title']")?.attr('content')?.split('-')[0]?.trim() || manga.title;
    }
    return details;
  }

  mangaDetailsParse(document: HtmlElement, manga: MangaSummary): MangaDetails {
    const details: MangaDetails = { url: manga.url, title: manga.title, status: 'unknown' };
    const profile = document.selectFirst(this.mangaDetailsSelector);
    if (!profile) return details;

    const thumbnail = profile.selectFirst(this.mangaDetailsSelectorThumbnail);
    details.thumbnailUrl = thumbnail?.absUrl('src') || thumbnail?.attr('src') || manga.thumbnailUrl;
    let description = profile
      .select(this.mangaDetailsSelectorDescription)
      .map((el) => el.text())
      .join(' ')
      .trim();
    const altName = selectFirstIgnoreCase(profile, this.mangaDetailsSelectorAltName)?.text();
    if (altName?.trim()) description = `${description}\n\n${this.altNamePrefix}${altName}`.trim();
    details.description = description || undefined;
    details.genres = profile
      .select(this.mangaDetailsSelectorGenres)
      .map((el) => el.text())
      .filter(Boolean);
    details.author = selectFirstIgnoreCase(profile, this.mangaDetailsSelectorAuthor)?.text() || undefined;
    details.artist = selectFirstIgnoreCase(profile, this.mangaDetailsSelectorArtist)?.text() || undefined;
    details.status = this.parseStatus(selectFirstIgnoreCase(profile, this.mangaDetailsSelectorStatus)?.text() ?? '');

    for (const element of profile.select(this.mangaDetailsSelectorInfo)) {
      const infoText = ownText(element) || element.selectFirst(this.mangaDetailsSelectorInfoTitle)?.text() || '';
      const descText = element
        .select(this.mangaDetailsSelectorInfoDescription)
        .map((el) => el.text())
        .join(' ')
        .trim();
      if (details.status === 'unknown' && this.statusSelectorList.some((s) => infoText.includes(s))) {
        details.status = this.parseStatus(descText);
      } else if (!details.author && this.authorSelectorList.some((s) => infoText.includes(s))) {
        details.author = descText || undefined;
      } else if (!details.artist && this.artisSelectorList.some((s) => infoText.includes(s))) {
        details.artist = descText || undefined;
      }
    }
    return details;
  }

  statusOnGoingList = [
    'ongoing',
    'en curso',
    'en emisión',
    'em lançamento',
    'activo',
    'ativo',
    'lançando',
    'مستمر',
    'مستمرة',
  ];
  statusCompletedList = ['completed', 'completo', 'finalizado', 'مكتمل', 'مكتملة'];
  statusHiatusList = ['hiatus', 'pausado'];
  statusCancelledList = ['cancelled', 'dropped', 'dropado', 'abandonado', 'cancelado'];

  parseStatus(text: string): MangaStatus {
    const value = text.toLowerCase().trim();
    if (this.statusOnGoingList.includes(value)) return 'ongoing';
    if (this.statusCompletedList.includes(value)) return 'completed';
    if (this.statusHiatusList.includes(value)) return 'hiatus';
    if (this.statusCancelledList.includes(value)) return 'cancelled';
    return 'unknown';
  }

  // Chapters
  chapterCategory = 'Chapter';
  preferChapterUpdatedDate = false;
  supportsChapterFeed = true;
  useNewChapterFeed = false;
  useOldChapterFeed = false;
  chapterFeedRegex = /clwd\.run\(["'](.*?)["']\)/;
  scriptSelector = '#clwd > script';

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const document = await this.fetchDocument(this.absolute(manga.url));
    const feedUrl = this.supportsChapterFeed ? this.getChapterFeedUrl(document, manga.title) : '';
    return this.getChapterList(feedUrl, document);
  }

  async fetchChapter(url: string, startIndex: number, maxResults: number): Promise<ZeistFeed> {
    return this.fetchJson<ZeistFeed>(
      withQuery(url, { 'start-index': String(startIndex), 'max-results': String(maxResults) }),
    );
  }

  async getChapterList(feedUrl: string, _document?: HtmlElement): Promise<Chapter[]> {
    // Total and server chunk size from a first, large request.
    const first = await this.fetchChapter(feedUrl, 1, MAX_CHAPTER_RESULTS);
    const entries = first.feed?.entry;
    if (!entries) throw new Error('Failed to parse from chapter API');
    const total = Number.parseInt(first.feed?.openSearch$totalResults?.$t ?? '', 10) || MAX_CHAPTER_RESULTS;
    const perPage = Number.parseInt(first.feed?.openSearch$itemsPerPage?.$t ?? '', 10) || CHAPTER_CHUNK;
    const starts: number[] = [];
    for (let start = entries.length; start < total; start += perPage) starts.push(start);
    const rest = await Promise.all(starts.map((start) => this.fetchChapter(feedUrl, start + 1, perPage)));
    const all = [...entries, ...rest.flatMap((page) => page.feed?.entry ?? [])];

    return all
      .filter((entry) => entry.category?.some((c) => c.term === this.chapterCategory))
      .map((entry) => {
        const updated = entry.updated?.$t?.trim();
        const published = entry.published?.$t?.trim();
        const date = this.preferChapterUpdatedDate ? (updated ?? published) : (published ?? updated);
        return this.entryToChapter(entry, this.parseDate(date));
      });
  }

  getChapterFeedUrl(document: HtmlElement, mangaTitle: string): string {
    if (this.useNewChapterFeed) return this.newChapterFeedUrl(document);
    if (this.useOldChapterFeed) return this.oldChapterFeedUrl(document);
    let feed = mangaTitle;
    const script = document.selectFirst(this.scriptSelector);
    if (!script) {
      try {
        return this.oldChapterFeedUrl(document);
      } catch {
        try {
          return this.newChapterFeedUrl(document);
        } catch {
          feed = mangaTitle;
        }
      }
    } else {
      feed = this.chapterFeedRegex.exec(script.html())?.[1] ?? mangaTitle;
    }
    return this.apiUrl(`${this.chapterCategory}/${feed}`);
  }

  oldChapterFeedUrl(document: HtmlElement): string {
    const src = document.selectFirst('#myUL > script')?.attr('src') ?? '';
    const feed = /([^']+)\?/.exec(src)?.[1];
    if (!feed) throw new Error('Failed to find chapter feed');
    return `${this.baseUrl}${feed}?alt=json`;
  }

  newChapterFeedUrl(document: HtmlElement): string {
    let regex = this.chapterFeedRegex;
    let script = document.selectFirst(this.scriptSelector);
    if (!script) {
      script = document.selectFirst('#latest > script');
      regex = /label\s*=\s*'([^']+)'/;
    }
    const feed = script ? regex.exec(script.html())?.[1] : undefined;
    if (!feed) throw new Error('Failed to find chapter feed');
    return withQuery(this.apiUrl(feed), { 'start-index': '1', 'max-results': '999999' });
  }

  parseDate(text: string | undefined): number | undefined {
    if (!text) return undefined;
    const time = Date.parse(text);
    return Number.isNaN(time) ? undefined : time;
  }

  // Pages
  pageListSelector = 'div.check-box div.separator';

  async getPages(chapter: Chapter): Promise<Page[]> {
    return this.pageListParse(await this.fetchDocument(this.absolute(chapter.url)));
  }

  pageListParse(document: HtmlElement): Page[] {
    return document
      .select(descendants(this.pageListSelector, 'img[src]'))
      .map((img) => img.absUrl('src') || img.attr('src') || '')
      .filter(Boolean)
      .map((imageUrl, index) => ({ index, imageUrl }));
  }

  imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  // Filters
  hasFilters = false;
  hasStatusFilter = true;
  hasTypeFilter = true;
  hasLanguageFilter = true;
  hasGenreFilter = true;

  getFilters(): Filter[] {
    if (!this.hasFilters) return [];
    const filters: Filter[] = [
      { type: 'header', label: 'Filters are ignored when searching by text' },
      { type: 'separator' },
    ];
    if (this.hasStatusFilter)
      filters.push({ type: 'select', id: 'status', label: 'Status', options: this.getStatusList() });
    if (this.hasTypeFilter) filters.push({ type: 'select', id: 'type', label: 'Type', options: this.getTypeList() });
    if (this.hasLanguageFilter) {
      filters.push({ type: 'select', id: 'language', label: 'Language', options: this.getLanguageList() });
    }
    if (this.hasGenreFilter) {
      filters.push({
        type: 'group',
        id: 'genre',
        label: 'Genre',
        filters: this.getGenreList().map((genre) => ({
          type: 'checkbox',
          id: `genre.${genre.value}`,
          label: genre.label,
        })),
      });
    }
    return filters;
  }

  getStatusList(): FilterOption[] {
    return [
      { label: 'All', value: '' },
      { label: 'Ongoing', value: 'Ongoing' },
      { label: 'Completed', value: 'Completed' },
      { label: 'Dropped', value: 'Dropped' },
      { label: 'Upcoming', value: 'Upcoming' },
      { label: 'Hiatus', value: 'Hiatus' },
      { label: 'Cancelled', value: 'Cancelled' },
    ];
  }

  getTypeList(): FilterOption[] {
    return [
      { label: 'All', value: '' },
      { label: 'Manga', value: 'Manga' },
      { label: 'Manhua', value: 'Manhua' },
      { label: 'Manhwa', value: 'Manhwa' },
      { label: 'Novel', value: 'Novel' },
      { label: 'Web Novel (JP)', value: 'Web Novel (JP)' },
      { label: 'Web Novel (KR)', value: 'Web Novel (KR)' },
      { label: 'Web Novel (CN)', value: 'Web Novel (CN)' },
      { label: 'Doujinshi', value: 'Doujinshi' },
    ];
  }

  getGenreList(): FilterOption[] {
    return [
      'Action', 'Adventure', 'Comedy', 'Crime', 'Drama', 'Ecchi', 'Fantasy', 'Harem', 'Historical', 'Horror',
      'Isekai', 'Josei', 'Magic', 'Martial Arts', 'Medical', 'Military', 'Music', 'Mystery', 'One Shot', 'Police',
      'Psychological', 'Reincarnation', 'Revenge', 'Romance', 'School Life', 'Sci-Fi', 'Seinen', 'Shounen',
      'Slice of Life', 'Sports', 'Supernatural', 'Survival', 'Thriller', 'Time Travel', 'Tragedy', 'Vampire',
    ].map((genre) => ({ label: genre, value: genre })); // prettier-ignore
  }

  getLanguageList(): FilterOption[] {
    return [
      { label: 'All', value: '' },
      { label: 'Indonesian', value: 'Indonesian' },
      { label: 'English', value: 'English' },
    ];
  }

  // URLs
  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)([^?#]*)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    const path = match[2] ?? '';
    if (path.split('/').filter(Boolean).length < 3) return null;
    return { url: path, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return this.absolute(item.url);
  }

  // Helpers
  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  async fetchDocument(url: string): Promise<HtmlElement> {
    const response = await http.get(url, { headers: this.headers() });
    return html.load(response.body, { baseUrl: response.url });
  }

  async fetchJson<T>(url: string): Promise<T> {
    const response = await http.get<T>(url, { headers: this.headers(), responseType: 'json' });
    return response.body;
  }

  absolute(url: string): string {
    if (/^https?:\/\//.test(url)) return url;
    if (url.startsWith('//')) return `https:${url}`;
    return `${this.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  /** Path of a link on the site (Tachiyomi's substringAfter(baseUrl)); links to other hosts stay absolute. */
  toRelative(url: string): string {
    const value = url.trim();
    const match = /^(?:https?:)?\/\/([^/?#]+)(.*)$/i.exec(value);
    if (!match) return value;
    const host = match[1]!.toLowerCase();
    const base = hostOf(this.baseUrl);
    if (host !== base && host.replace(/^www\./, '') !== base.replace(/^www\./, '')) return value;
    const path = match[2] || '/';
    return path.startsWith('/') ? path : `/${path}`;
  }

  toSource(): Source {
    const source: Source = {
      baseUrl: this.baseUrl,
      getPopular: (page) => this.getPopular(page),
      search: (query, page, filters) => this.search(query, page, filters),
      getFilters: () => this.getFilters(),
      getMangaDetails: (manga) => this.getMangaDetails(manga),
      getChapters: (manga) => this.getChapters(manga),
      getPages: (chapter) => this.getPages(chapter),
      imageHeaders: () => this.imageHeaders(),
      resolveUrl: (url) => this.resolveUrl(url),
      getWebUrl: (item) => this.getWebUrl(item),
    };
    if (this.supportsLatest) source.getLatest = (page) => this.getLatest(page);
    return source;
  }
}

// ---------------------------------------------------------------------------------------------
// Helpers (the sandbox has no URL; cheerio's `:contains` is case-sensitive and there is no ownText()).

export function hostOf(url: string): string {
  return /^(?:https?:)?\/\/([^/?#]+)/i.exec(url)?.[1]?.toLowerCase() ?? '';
}

/** Sets (replaces) query parameters of a url. */
export function withQuery(url: string, params: Record<string, string>): string {
  const [path = '', search = ''] = url.split('?');
  const kept = search.split('&').filter((pair) => pair && !(decodeURIComponent(pair.split('=')[0] ?? '') in params));
  const added = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  return `${path}?${[...kept, ...added].join('&')}`;
}

/** `a, b` + `img` → `a img, b img` */
export function descendants(selector: string, child: string): string {
  return splitSelectorList(selector)
    .map((part) => `${part} ${child}`)
    .join(', ');
}

export function splitSelectorList(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let current = '';
  for (const char of selector) {
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;
    else if (char === ',' && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** selectFirst where `:contains(x)` matches case-insensitively, as in Jsoup. */
export function selectFirstIgnoreCase(root: HtmlElement, selector: string): HtmlElement | null {
  if (!selector.includes(':contains(')) return root.selectFirst(selector);
  const variants = new Set<string>();
  for (const part of splitSelectorList(selector)) {
    for (const transform of [
      (s: string) => s,
      (s: string) => s.toLowerCase(),
      (s: string) => s.toUpperCase(),
      (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(),
    ]) {
      variants.add(part.replace(/:contains\(([^)]*)\)/g, (_, text: string) => `:contains(${transform(text)})`));
    }
  }
  return root.selectFirst([...variants].join(', '));
}

/** Text of the element without the text of its child elements (Jsoup ownText). */
export function ownText(element: HtmlElement | null | undefined): string {
  if (!element) return '';
  let text = element
    .html()
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  let previous;
  do {
    previous = text;
    text = text.replace(/<([a-zA-Z][\w-]*)\b[^>]*>[^<]*<\/\1\s*>/g, ' ');
  } while (text !== previous);
  return decodeEntities(text.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}
