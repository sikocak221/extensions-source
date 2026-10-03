// Keyoapp, ported from keiyoushi/extensions-source lib-multisrc/keyoapp. This directory is a template:
// every extension using the theme keeps an identical copy in src/keyoapp/ (`node scripts/sync-multisrc.mjs`)
// and overrides members in a subclass.
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
import { USER_AGENT, absoluteUrl, hostOf, ownText, parseDate, relativeUrl, selectIgnoreCase, withQuery } from './utils';

/** Preference read by {@link Keyoapp.chapterListSelector}. */
export const SHOW_PAID_CHAPTERS_PREFERENCE: Preference = {
  type: 'switch',
  key: 'pref_show_paid_chap',
  label: 'Show paid chapters',
  description: 'Paid chapters are marked with a lock and need an account on the website.',
  default: false,
};

export abstract class Keyoapp {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;
  datePattern = 'MMM d, yyyy';

  // Popular: the home page's "Popular"/"Trending" block.
  popularMangaTitleSelector = ['Popular', 'Popularie', 'Trending'];

  popularMangaSelector(): string {
    return this.popularMangaTitleSelector.map((t) => `div:contains(${t}) + div .group.overflow-hidden.grid`).join(', ');
  }

  popularMangaFromElement(element: HtmlElement): MangaSummary {
    // Jsoup's selectFirst also matches the element itself (some cards are the link).
    const link = element.attr('href') ? element : element.selectFirst('a[href]');
    return {
      url: relativeUrl(link?.absUrl('href') || link?.attr('href') || ''),
      title: link?.attr('title') ?? '',
      thumbnailUrl: this.imageUrl(element, '*[style*=background-image]'),
    };
  }

  isNovel(element: HtmlElement): boolean {
    if ((element.attr('data-type') ?? '').toLowerCase() === 'novel') return true;
    if (element.select('[data-type]').some((el) => (el.attr('data-type') ?? '').toLowerCase() === 'novel')) return true;
    return element.select('span').some((span) => ownText(span).toLowerCase() === 'novel');
  }

  parseList(document: HtmlElement, selector: string): MangaSummary[] {
    return selectIgnoreCase(document, selector)
      .filter((element) => !this.isNovel(element))
      .map((element) => this.popularMangaFromElement(element))
      .filter((manga) => manga.url && manga.title);
  }

  async getPopular(): Promise<MangaPage> {
    return {
      items: this.parseList(await this.fetchDocument(this.baseUrl), this.popularMangaSelector()),
      hasNextPage: false,
    };
  }

  latestUpdatesSelector(): string {
    return 'div.grid > div.group';
  }

  async getLatest(): Promise<MangaPage> {
    return {
      items: this.parseList(await this.fetchDocument(`${this.baseUrl}/latest/`), this.latestUpdatesSelector()),
      hasNextPage: false,
    };
  }

  // Search: the series page lists everything; query and filters are applied here.
  searchMangaSelector(): string {
    return '#searched_series_page > button';
  }

  searchUrl(_query: string, _page: number): string {
    return `${this.baseUrl}/series`;
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const checked = (prefix: string) =>
      Object.entries(filters)
        .filter(([id, value]) => id.startsWith(prefix) && value === true)
        .map(([id]) => id.slice(prefix.length).toLowerCase());
    const genres = checked('genre.');
    const types = checked('type.');
    const statuses = checked('status.');
    const q = query.trim().toLowerCase();
    const document = await this.fetchDocument(withQuery(this.searchUrl(q, page), { q: q || undefined }));
    const items = document
      .select(this.searchMangaSelector())
      .filter((entry) => {
        if (this.isNovel(entry)) return false;
        if (q && !(entry.attr('title') ?? '').toLowerCase().includes(q)) return false;
        if (genres.length > 0) {
          let tags: string[] = [];
          try {
            tags = (JSON.parse((entry.attr('tags') ?? '[]').replace(/___/g, "'")) as string[]).map((t) =>
              t.toLowerCase(),
            );
          } catch {
            tags = [];
          }
          if (!genres.every((g) => tags.includes(g))) return false;
        }
        if (types.length > 0 && !types.includes((entry.attr('data-type') ?? '').toLowerCase())) return false;
        if (statuses.length > 0 && !statuses.includes((entry.attr('data-status') ?? '').toLowerCase())) return false;
        return true;
      })
      .map((entry) => this.popularMangaFromElement(entry))
      .filter((manga) => manga.url && manga.title);
    return { items, hasNextPage: false };
  }

  // Details
  descriptionSelector = '#expand_content p';
  altNameSelector = 'div.font-medium:contains(Alternative titles) ~ div span';
  altNamePrefix = 'Alternative Names:';
  statusSelector = 'div:has(> span:contains(Status)) ~ div';
  authorSelector = 'div:has(> span:contains(Author)) ~ div';
  artistSelector = 'div:has(> span:contains(Artist)) ~ div';
  genreSelector = "div:has(>h1) a[href*='genre=']";
  typeSelector = 'div:has(> span:contains(Type)) ~ div';
  dateSelector = '.text-xs';

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    return this.mangaDetailsParse(await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url)), manga);
  }

  mangaDetailsParse(document: HtmlElement, manga: MangaSummary): MangaDetails {
    const first = (selector: string) => selectIgnoreCase(document, selector)[0]?.text() || undefined;
    const type = first(this.typeSelector);
    const genres = [
      ...(type ? [type.charAt(0).toUpperCase() + type.slice(1)] : []),
      ...document.select(this.genreSelector).map((a) => a.text().replace(/^[,\s]+|[,\s]+$/g, '')),
    ].filter(Boolean);
    const synopsis = document.selectFirst(this.descriptionSelector)?.text() ?? '';
    const altNames = selectIgnoreCase(document, this.altNameSelector)
      .map((el) => el.text())
      .filter((name) => name && name !== 'No alternative titles.');
    let description = synopsis;
    if (altNames.length > 0) {
      description += `${description ? '\n\n' : ''}${this.altNamePrefix}\n${altNames.map((n) => `- ${n}`).join('\n')}`;
    }
    const lowerType = type?.toLowerCase() ?? '';
    return {
      url: manga.url,
      title: document.selectFirst('div.grid > h1')?.text() || manga.title,
      thumbnailUrl: this.imageUrl(document, 'div[class*=photoURL], div[style*=photoURL]') ?? manga.thumbnailUrl,
      status: this.parseStatus(first(this.statusSelector)),
      author: first(this.authorSelector),
      artist: first(this.artistSelector),
      genres,
      description: description || undefined,
      type: lowerType.includes('manhwa')
        ? 'manhwa'
        : lowerType.includes('manhua')
          ? 'manhua'
          : lowerType.includes('manga')
            ? 'manga'
            : undefined,
    };
  }

  parseStatus(text: string | undefined): MangaStatus {
    switch (text?.toLowerCase()) {
      case 'ongoing':
        return 'ongoing';
      case 'dropped':
        return 'cancelled';
      case 'paused':
        return 'hiatus';
      case 'completed':
        return 'completed';
      default:
        return 'unknown';
    }
  }

  // Chapters
  paidChapterSelector = 'img[alt~=Coin]';

  chapterListSelector(): string {
    const base =
      '#chapters > a:not(:has(.text-sm span:contains(Upcoming))), #chapters > div:not(:has(.text-sm span:contains(Upcoming)))';
    if (prefs.get<boolean>(SHOW_PAID_CHAPTERS_PREFERENCE.key)) return base;
    return base
      .split(', ')
      .map((part) => `${part}:not(:has(${this.paidChapterSelector}))`)
      .join(', ');
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url));
    return document
      .select(this.chapterListSelector())
      .map((element) => this.chapterFromElement(element))
      .filter((chapter) => chapter.url);
  }

  chapterFromElement(element: HtmlElement): Chapter {
    const link = element.attr('href') ? element : element.selectFirst('a[href]');
    const name = element.selectFirst('.text-sm')?.text() ?? '';
    const paid = element.select(this.paidChapterSelector).length > 0;
    return {
      url: relativeUrl(link?.absUrl('href') || link?.attr('href') || ''),
      name: paid ? `🔒 ${name}` : name,
      uploadedAt: this.parseChapterDate(element.selectFirst(this.dateSelector)?.text()),
    };
  }

  parseChapterDate(text: string | undefined): number | undefined {
    const value = text?.trim();
    if (!value) return undefined;
    if (!value.includes('ago')) return parseDate(value, this.datePattern);
    const amount = Number.parseInt((value.split(' ')[0] ?? '').replace('one', '1').replace(/^an?$/, '1'), 10);
    if (Number.isNaN(amount)) return undefined;
    const date = new Date();
    date.setSeconds(0, 0);
    if (value.includes('second')) date.setSeconds(date.getSeconds() - amount);
    else if (value.includes('minute')) date.setMinutes(date.getMinutes() - amount);
    else if (value.includes('hour')) date.setHours(date.getHours() - amount);
    else if (value.includes('day')) date.setDate(date.getDate() - amount);
    else if (value.includes('week')) date.setDate(date.getDate() - amount * 7);
    else if (value.includes('month')) date.setMonth(date.getMonth() - amount);
    else if (value.includes('year')) date.setFullYear(date.getFullYear() - amount);
    return date.getTime();
  }

  // Pages: image ids ("uid") on a CDN named in a script, or (older sites) plain image urls.
  async getPages(chapter: Chapter): Promise<Page[]> {
    const response = await http.get(absoluteUrl(this.baseUrl, chapter.url), { headers: this.headers() });
    return this.pageListParse(html.load(response.body, { baseUrl: response.url }), response.body);
  }

  pageListParse(document: HtmlElement, body: string): Page[] {
    const images = document.select('#pages > img');
    const uids = images.map((img) => img.attr('uid') ?? '').filter(Boolean);
    if (uids.length > 0) {
      const cdn = this.cdnUrl(body);
      if (!cdn) throw new Error('Could not find the image server of this chapter');
      return uids.map((uid, index) => ({ index, imageUrl: `${cdn}/${uid}` }));
    }
    return images
      .map((img) => img.absUrl('data-lazy-src') || img.absUrl('data-src') || img.absUrl('src') || '')
      .filter((url) => /^(https?:)?\/\/cdn\d*\.keyoapp\.com/.test(url))
      .map((imageUrl, index) => ({ index, imageUrl }));
  }

  cdnUrl(body: string): string | null {
    const host = /realUrl\s*=\s*`[^`]+\/\/([^/]+)/.exec(body)?.[1]?.replace(/\$\{[^}]*\}/g, '');
    return host ? `https://${host}/uploads` : null;
  }

  imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  // Filters
  getTypeList(): string[] {
    return ['Manhwa', 'Manhua', 'Manga', 'Mangatoon', 'Comic'];
  }

  getStatusList(): string[] {
    return ['Ongoing', 'Completed', 'Dropped', 'Hiatus'];
  }

  async getFilters(): Promise<Filter[]> {
    const group = (id: string, label: string, values: [string, string][]): Filter => ({
      type: 'group',
      id,
      label,
      filters: values.map(([name, value]) => ({ type: 'checkbox', id: `${id}.${value}`, label: name })),
    });
    const filters: Filter[] = [];
    try {
      const genres = await this.fetchGenres();
      if (genres.length > 0) filters.push(group('genre', 'Genres', genres));
    } catch (error) {
      log.warn('Cannot load genres', error);
    }
    const types = this.getTypeList();
    if (types.length > 0)
      filters.push(
        group(
          'type',
          'Type',
          types.map((t) => [t, t.toLowerCase()]),
        ),
      );
    const statuses = this.getStatusList();
    if (statuses.length > 0)
      filters.push(
        group(
          'status',
          'Status',
          statuses.map((s) => [s, s.toLowerCase()]),
        ),
      );
    return filters;
  }

  /** Genres from the series page script (`initializeDropdownMenu({ type: "genre", items: [...] })`). */
  async fetchGenres(): Promise<[string, string][]> {
    const response = await http.get(`${this.baseUrl}/series/`, { headers: this.headers() });
    const script = response.body
      .split('initializeDropdownMenu({')
      .slice(1)
      .find((part) => /type:\s*"genre"/.test(part.slice(0, 200)));
    const items = script?.slice(script.indexOf('items:')).split(']')[0] ?? '';
    const genres = [...items.matchAll(/displayName:\s*["'`]([^"'`]+)["'`][^}]*?value:\s*["'`]([^"'`]+)["'`]/g)].map(
      (m): [string, string] => [m[1]!, m[2]!],
    );
    return genres.sort((a, b) => a[0].localeCompare(b[0]));
  }

  // URLs
  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)(\/[^/?#]+\/[^/?#]+\/?)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: match[2]!, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return absoluteUrl(this.baseUrl, item.url);
  }

  // Helpers
  /** Url from a `background-image: url(...)` style, asking for a 480 px wide thumbnail. */
  imageUrl(root: HtmlElement, selector: string): string | undefined {
    const style = root.selectFirst(selector)?.attr('style') ?? '';
    const url = /url\(['"]?([^(['")\]]+)/.exec(style)?.[1];
    if (!url) return undefined;
    return withQuery(url, { w: '480' });
  }

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  async fetchDocument(url: string): Promise<HtmlElement> {
    const response = await http.get(url, { headers: this.headers() });
    return html.load(response.body, { baseUrl: response.url });
  }

  toSource(): Source {
    return {
      baseUrl: this.baseUrl,
      getPopular: () => this.getPopular(),
      getLatest: () => this.getLatest(),
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
