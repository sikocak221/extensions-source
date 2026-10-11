// GalleryAdults, ported from keiyoushi/extensions-source lib-multisrc/galleryadults. This directory is a template:
// every extension using the theme keeps an identical copy in src/galleryadults/
// (`node scripts/sync-multisrc.mjs`).
//
// Kotlin's `Element.foo()` extension members are methods taking the element here; `override val` constants are
// plain fields. One instance per language of the extension (`lang` comes from the manifest source).
import type {
  Chapter,
  Filter,
  FilterState,
  HtmlElement,
  MangaDetails,
  MangaPage,
  MangaSummary,
  Page,
  Preference,
  Source,
} from '@matane/extension-sdk';
import { absoluteUrl, hostOf, relativeUrl } from './utils';

export const LANGUAGE_MULTI = '';
export const LANGUAGE_ENGLISH = 'english';
export const LANGUAGE_JAPANESE = 'japanese';
export const LANGUAGE_CHINESE = 'chinese';
export const LANGUAGE_KOREAN = 'korean';
export const LANGUAGE_SPANISH = 'spanish';
export const LANGUAGE_FRENCH = 'french';
export const LANGUAGE_GERMAN = 'german';
export const LANGUAGE_RUSSIAN = 'russian';
export const LANGUAGE_SPEECHLESS = 'speechless';
export const LANGUAGE_TRANSLATED = 'translated';

export const PREF_SHORT_TITLE = 'pref_short_title';

interface Entry {
  title: string;
  url: string;
  thumbnail?: string;
  lang: string;
}

// Any space except after a comma (spaces are only replaced between words).
const regexSpaceNotAfterComma = /(?<!,)\s+/g;
const regexExcludeTerm = /^(-?)"?(.+)"?/;
const shortenTitleRegex = /(\[[^\]]*\]|[({][^)}]*[)}])/g;

const toBinary = (value: boolean) => (value ? '1' : '0');
const last = (path: string) => path.replace(/\/+$/, '').split('/').pop() ?? '';

/** Converts thumbnail urls to full image urls. */
export function thumbnailToFull(url: string): string {
  const ext = url.slice(url.lastIndexOf('.') + 1);
  return url.replace(`t.${ext}`, `.${ext}`);
}

export function imgAttr(element: HtmlElement | null | undefined): string | undefined {
  if (!element) return undefined;
  if (element.attr('data-cfsrc') != null) return element.absUrl('data-cfsrc');
  if (element.attr('data-src') != null) return element.absUrl('data-src');
  if (element.attr('data-lazy-src') != null) return element.absUrl('data-lazy-src');
  if (element.attr('srcset') != null) return (element.absUrl('srcset') ?? '').split(' ')[0];
  return element.absUrl('src');
}

/** Own text nodes of an element (the sandbox has no ownText()). */
export function ownText(element: HtmlElement | null | undefined): string {
  if (!element) return '';
  const text = element.html().replace(/<([a-z][a-z0-9]*)\b[^>]*>[\s\S]*?<\/\1>|<[^>]*>/gi, '');
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Relative ("2 days ago"), "yesterday"/"today" and ISO dates → epoch ms (0 when unknown). */
export function parseDateText(date: string | undefined): number {
  if (!date) return 0;
  const text = date.trim();
  const iso = Date.parse(text);
  if (!Number.isNaN(iso) && /\d{4}/.test(text)) return iso;
  const midnight = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const lower = text.toLowerCase();
  if (lower.startsWith('yesterday') || lower.startsWith('يوم واحد')) return midnight(-1);
  if (lower.startsWith('today') || lower.startsWith('just now')) return midnight(0);
  if (lower.startsWith('يومين')) return midnight(-2);
  if (/(ago|atrás|önce|قبل)$/i.test(text) || lower.startsWith('hace')) return parseRelativeDate(text);
  return 0;
}

function parseRelativeDate(date: string): number {
  let number = Number.parseInt(/\d*[^0-9]*(\d+)/.exec(date)?.[0] ?? '', 10);
  if (Number.isNaN(number)) {
    number = Number.parseInt((date.split(' ')[0] ?? '').replace('one', '1').replace('a', '1'), 10);
  }
  if (Number.isNaN(number)) return 0;
  const has = (...words: string[]) => words.some((w) => date.toLowerCase().includes(w));
  const now = new Date();
  if (has('detik', 'segundo', 'second', 'วินาที')) now.setSeconds(now.getSeconds() - number);
  else if (has('menit', 'dakika', 'min', 'minute', 'minuto', 'นาที', 'دقائق'))
    now.setMinutes(now.getMinutes() - number);
  else if (has('jam', 'saat', 'heure', 'hora', 'hour', 'ชั่วโมง', 'giờ', 'ore', 'ساعة', '小时'))
    now.setHours(now.getHours() - number);
  else if (has('hari', 'gün', 'jour', 'día', 'dia', 'day', 'วัน', 'ngày', 'giorni', 'أيام', '天'))
    now.setDate(now.getDate() - number);
  else if (has('week', 'semana')) now.setDate(now.getDate() - number * 7);
  else if (has('month', 'mes')) now.setMonth(now.getMonth() - number);
  else if (has('year', 'año')) now.setFullYear(now.getFullYear() - number);
  else return 0;
  return now.getTime();
}

export abstract class GalleryAdults {
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  readonly mangaLang: string;

  constructor(readonly lang: string) {
    this.mangaLang = this.languageName(lang);
  }

  /** Maps the extension language to one of the LANGUAGE_* constants (LANGUAGE_MULTI for "all"). */
  languageName(lang: string): string {
    return lang === 'all' ? LANGUAGE_MULTI : lang;
  }

  supportsLatest(): boolean {
    return true;
  }

  headers(): Record<string, string> {
    return {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
      Referer: `${this.baseUrl}/`,
    };
  }

  xhrHeaders(): Record<string, string> {
    return { ...this.headers(), 'X-Requested-With': 'XMLHttpRequest' };
  }

  async fetchDocument(url: string): Promise<HtmlElement> {
    const response = await http.get(url, { headers: this.headers() });
    return html.load(response.body, { baseUrl: response.url });
  }

  preferences(): Preference[] {
    return [{ type: 'switch', key: PREF_SHORT_TITLE, label: 'Display Short Titles', default: false }];
  }

  useShortTitlePreference = true;

  get shortTitle(): boolean {
    return this.useShortTitlePreference && (prefs.get<boolean>(PREF_SHORT_TITLE) ?? false);
  }

  // ============================== List detail ==============================
  mangaTitleSelector = '.caption';

  mangaFullTitle(element: HtmlElement, selector: string): string | undefined {
    return element.selectFirst(selector)?.text();
  }

  mangaTitle(element: HtmlElement, selector = this.mangaTitleSelector): string | undefined {
    const title = this.mangaFullTitle(element, selector);
    return this.shortTitle && title !== undefined ? this.shortenTitle(title) : title;
  }

  shortenTitle(title: string): string {
    return title.replace(shortenTitleRegex, '').trim();
  }

  mangaUrl(element: HtmlElement): string | undefined {
    return element.selectFirst('.inner_thumb a')?.absUrl('href');
  }

  mangaThumbnail(element: HtmlElement): string | undefined {
    return imgAttr(element.selectFirst('.inner_thumb img'));
  }

  /** Overwrite to filter other languages' manga from a search result. The default filters nothing. */
  mangaLangOf(_element: HtmlElement): string {
    return this.mangaLang;
  }

  addPageUri(url: string, page: number): string {
    const base = url.trim().replace(/^\/+|\/+$/g, '');
    return `${base}${url.includes('?') ? '&' : '/?'}page=${page}`;
  }

  // ============================== Popular ==============================
  popularMangaUrl(): string {
    let url = `${this.baseUrl}/`;
    if (this.mangaLang) url += `language/${this.mangaLang}/`;
    if (this.supportsLatest()) url += 'popular';
    return url;
  }

  popularMangaSelector(): string {
    return 'div.thumb';
  }

  popularMangaNextPageSelector(): string {
    return ".pagination li.active + li:not(.disabled), a[rel='next']";
  }

  popularMangaFromElement(element: HtmlElement): MangaSummary {
    return {
      title: this.mangaTitle(element) ?? '',
      url: relativeUrl(this.mangaUrl(element) ?? ''),
      thumbnailUrl: this.mangaThumbnail(element),
    };
  }

  parseListing(document: HtmlElement, selector = this.popularMangaSelector()): MangaPage {
    const hasNextPage = document.selectFirst(this.popularMangaNextPageSelector()) != null;
    return { items: document.select(selector).map((e) => this.popularMangaFromElement(e)), hasNextPage };
  }

  async getPopular(page: number): Promise<MangaPage> {
    return this.parseListing(await this.fetchDocument(this.addPageUri(this.popularMangaUrl(), page)));
  }

  // ============================== Latest ==============================
  latestUpdatesUrl(): string {
    return `${this.baseUrl}/${this.mangaLang ? `language/${this.mangaLang}` : ''}`;
  }

  async getLatest(page: number): Promise<MangaPage> {
    return this.parseListing(await this.fetchDocument(this.addPageUri(this.latestUpdatesUrl(), page)));
  }

  // ============================== Search ==============================
  /** Manga url: $baseUrl/$idPrefixUri/<id>/ */
  idPrefixUri = 'gallery';
  randomEntryUrl(): string {
    return `${this.baseUrl}/random/`;
  }
  useIntermediateSearch = false;
  supportAdvancedSearch = false;
  supportSpeechless = false;
  searchPopularPath = 'popular';
  basicSearchKey = 'q';
  intermediateSearchKey = 'key';
  advancedSearchKey = 'key';
  advancedSearchUri = 'advsearch';
  favoritePath = 'user/fav_pags.php';

  get useBasicSearch(): boolean {
    return !this.useIntermediateSearch;
  }

  async getMangaById(id: string): Promise<MangaSummary> {
    const document = await this.fetchDocument(`${this.baseUrl}/${this.idPrefixUri}/${id}`);
    const details = this.parseMangaDetails(document);
    return { url: `/${this.idPrefixUri}/${id}/`, title: details.title, thumbnailUrl: details.thumbnailUrl };
  }

  async randomEntry(): Promise<MangaPage> {
    const response = await http.get(this.randomEntryUrl(), { headers: this.headers() });
    const document = html.load(response.body, { baseUrl: response.url });
    const id = last(response.url.split(/[?#]/)[0]!);
    return {
      items: [
        {
          title: this.mangaTitle(document, 'h1') ?? '',
          url: `/${this.idPrefixUri}/${id}/`,
          thumbnailUrl: this.getCover(document),
        },
      ],
      hasNextPage: false,
    };
  }

  /** Sort options as `[label, uri]`. */
  sortOrderUris(): [string, string][] {
    const sorts: [string, string][] = [
      ['Popular', 'pp'],
      ['Latest', 'lt'],
    ];
    if (this.useIntermediateSearch || this.supportAdvancedSearch) {
      sorts.push(['Downloads', 'dl'], ['Top Rated', 'tr']);
    }
    return sorts;
  }

  categoryUris(): [string, string, boolean?][] {
    return [
      ['Manga', 'm'],
      ['Doujinshi', 'd'],
      ['Western', 'w'],
      ['Image Set', 'i'],
      ['Artist CG', 'a'],
      ['Game CG', 'g'],
    ];
  }

  languageUris(): [string, string][] {
    return [
      [LANGUAGE_ENGLISH, 'en'],
      [LANGUAGE_JAPANESE, 'jp'],
      [LANGUAGE_SPANISH, 'es'],
      [LANGUAGE_FRENCH, 'fr'],
      [LANGUAGE_KOREAN, 'kr'],
      [LANGUAGE_GERMAN, 'de'],
      [LANGUAGE_RUSSIAN, 'ru'],
    ];
  }

  /** Index of the selected sort order (0 when none). */
  sortIndex(filters: FilterState): number {
    const value = typeof filters.sort === 'string' ? filters.sort : undefined;
    const index = this.sortOrderUris().findIndex(([, uri]) => uri === value);
    return index < 0 ? 0 : index;
  }

  selectedTags(filters: FilterState): string[] {
    return Object.entries(filters)
      .filter(([id, value]) => id.startsWith('tag.') && value === true)
      .map(([id]) => id.slice(4));
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    if (/^\d+$/.test(query.trim())) return { items: [await this.getMangaById(query.trim())], hasNextPage: false };
    if (filters.random === true) return this.randomEntry();
    if (filters.favorites === true) return this.searchFavorites(page);

    const selected = this.selectedTags(filters);
    const advanced = ['tags', 'parodies', 'artists', 'characters', 'groups'].some(
      (id) => typeof filters[id] === 'string' && (filters[id] as string).trim() !== '',
    );

    let url: string;
    if (this.supportSpeechless && filters.speechless === true)
      url = this.speechlessFilterSearchUrl(page, query, filters);
    else if (this.supportAdvancedSearch && advanced) url = this.advancedSearchUrl(page, query, filters);
    else if (selected.length === 1 && !query.trim()) url = this.tagBrowsingSearchUrl(page, query, filters);
    else if (this.useIntermediateSearch) url = this.intermediateSearchUrl(page, query, filters);
    else if (this.useBasicSearch && (selected.length > 1 || query.trim()))
      url = this.basicSearchUrl(page, query, filters);
    else if (this.sortIndex(filters) === 1) url = this.latestUpdatesUrl();
    else url = this.popularMangaUrl();

    return this.parseSearch(await http.get(this.addPageUri(url, page), { headers: this.headers() }));
  }

  async searchFavorites(page: number): Promise<MangaPage> {
    const response = await http.post(
      `${this.baseUrl}/${this.favoritePath}`,
      { form: { page: String(page) } },
      { headers: this.xhrHeaders() },
    );
    return this.parseSearch(response);
  }

  /**
   * Convert spaces typed in the search box into plus (+): use plus for an exact match and a comma (, ) to
   * separate terms (AND). Plus after a comma has no effect.
   */
  buildQueryString(tags: string[], query: string): string {
    return [...tags, query]
      .filter((s) => s.trim() !== '')
      .map((s) => s.trim().replace(regexSpaceNotAfterComma, '+').replace(/ /g, ''))
      .join(',');
  }

  queryString(params: [string, string][]): string {
    return params.map(([k, v]) => `${k}=${v}`).join('&');
  }

  basicSearchUrl(_page: number, query: string, filters: FilterState): string {
    const selected = this.selectedTags(filters);
    const params: [string, string][] = [[this.basicSearchKey, this.buildQueryString(selected, query)]];
    if (this.sortIndex(filters) === 0) params.push(['sort', 'popular']);
    return `${this.baseUrl}/search/?${this.queryString(params)}`;
  }

  intermediateSearchUrl(_page: number, query: string, filters: FilterState): string {
    const selected = this.selectedTags(filters);
    const sortIndex = this.sortIndex(filters);
    const params: [string, string][] = [];
    this.sortOrderUris().forEach(([, uri], index) => params.push([uri, toBinary(sortIndex === index)]));
    this.categoryUris().forEach(([, uri, def], index) => {
      void index;
      const value = filters[`category.${uri}`];
      params.push([uri, toBinary(typeof value === 'boolean' ? value : (def ?? true))]);
    });
    for (const [name, uri] of this.languageUris()) {
      params.push([uri, toBinary(this.mangaLang === name || this.mangaLang === LANGUAGE_MULTI)]);
    }
    params.push([this.intermediateSearchKey, this.buildQueryString(selected, query)]);
    return `${this.baseUrl}/search/?${this.queryString(params)}`;
  }

  advancedSearchUrl(_page: number, _query: string, filters: FilterState): string {
    const selected = this.selectedTags(filters);
    const sortIndex = this.sortIndex(filters);
    const params: [string, string][] = [];
    this.sortOrderUris().forEach(([, uri], index) => params.push([uri, toBinary(sortIndex === index)]));
    this.categoryUris().forEach(([, uri, def]) => {
      const value = filters[`category.${uri}`];
      params.push([uri, toBinary(typeof value === 'boolean' ? value : (def ?? true))]);
    });
    for (const [name, uri] of this.languageUris()) {
      params.push([uri, toBinary(this.mangaLang === name || this.mangaLang === LANGUAGE_MULTI)]);
    }
    // Builds this query string: +tag:"bat+man"+-tag:"cat"+artist:"Joe"...
    // +tag must be encoded into %2Btag while the rest are not needed to encode.
    const keys: string[] = selected.map((name) => `%2Btag:"${name}"`);
    for (const [id, key] of [
      ['tags', 'tag'],
      ['parodies', 'parody'],
      ['artists', 'artist'],
      ['characters', 'character'],
      ['groups', 'group'],
    ] as const) {
      const value = filters[id];
      if (typeof value !== 'string') continue;
      for (const term of value.trim().replace(regexSpaceNotAfterComma, '+').replace(/ /g, '').split(',')) {
        const match = regexExcludeTerm.exec(term);
        if (match) keys.push(`${match[1] ? '-' : '%2B'}${key}:"${match[2]}"`);
      }
    }
    params.push([this.advancedSearchKey, keys.join('+')]);
    return `${this.baseUrl}/${this.advancedSearchUri}/?${this.queryString(params)}`;
  }

  tagBrowsingSearchUrl(_page: number, _query: string, filters: FilterState): string {
    const tag = this.selectedTags(filters)[0]!;
    return `${this.baseUrl}/tag/${encodeURIComponent(tag)}${this.sortIndex(filters) === 0 ? `/${this.searchPopularPath}` : ''}`;
  }

  /** Some sites exclude speechless titles from normal search and allow browsing them separately. */
  speechlessFilterSearchUrl(_page: number, _query: string, filters: FilterState): string {
    return `${this.baseUrl}/language/${LANGUAGE_SPEECHLESS}${this.sortIndex(filters) === 0 ? `/${this.searchPopularPath}` : ''}`;
  }

  loginRequired(document: HtmlElement, url: string): boolean {
    return url.includes('/login/') && document.select('input[value=Login]').length > 0;
  }

  searchMangaSelector(): string {
    return this.popularMangaSelector();
  }

  parseSearch(response: { body: string; url: string }): MangaPage {
    const document = html.load(response.body, { baseUrl: response.url });
    if (this.loginRequired(document, response.url)) throw new Error('Log in via WebView to view favorites');
    const hasNextPage = document.selectFirst(this.popularMangaNextPageSelector()) != null;
    return { items: this.searchEntries(document.select(this.searchMangaSelector()), hasNextPage), hasNextPage };
  }

  searchEntries(elements: HtmlElement[], hasNextPage: boolean): MangaSummary[] {
    const entries: Entry[] = [];
    for (const element of elements) {
      const title = this.mangaTitle(element);
      const url = this.mangaUrl(element);
      if (title === undefined || !url) continue;
      entries.push({ title, url, thumbnail: this.mangaThumbnail(element), lang: this.mangaLangOf(element) });
    }
    let results = entries.filter((e) => !this.mangaLang || e.lang === LANGUAGE_SPEECHLESS || e.lang === this.mangaLang);
    // Return at least one title if all manga of the page are in other languages.
    if (results.length === 0 && hasNextPage && entries.length > 0) results = [entries[0]!];
    return results.map((e) => ({ title: e.title, url: relativeUrl(e.url), thumbnailUrl: e.thumbnail }));
  }

  // ============================== Details ==============================
  mangaDetailInfoSelector = '.gallery_top';

  getCover(element: HtmlElement): string | undefined {
    return imgAttr(element.selectFirst('.cover img'));
  }

  getInfoSelector(_tag: string): string {
    throw new Error('getInfoSelector is not implemented');
  }

  infoTagName(element: HtmlElement): string {
    return ownText(element);
  }

  getInfo(element: HtmlElement, tag: string): string {
    return element
      .select(this.getInfoSelector(tag))
      .flatMap((e) => [this.infoTagName(e), (e.selectFirst('.split_tag')?.text() ?? '').replace(/^\| /, '').trim()])
      .filter((s) => s.trim() !== '')
      .sort()
      .join(', ');
  }

  getInfoPages(_element: HtmlElement, document?: HtmlElement): string | undefined {
    return document ? this.totalPages(document) : undefined;
  }

  getInfoAlternativeTitle(element: HtmlElement): string | undefined {
    return ownText(element.selectFirst('h1 + h2, .subtitle')) || undefined;
  }

  getInfoFullTitle(element: HtmlElement): string | undefined {
    return this.mangaFullTitle(element, 'h1');
  }

  getDescription(element: HtmlElement, document?: HtmlElement): string {
    const parts: string[] = [];
    for (const tag of ['Parodies', 'Characters', 'Groups', 'Languages', 'Categories', 'Category']) {
      const info = this.getInfo(element, tag);
      if (info.trim()) parts.push(`**${tag}**: ${info}`);
    }
    const pages = this.getInfoPages(element, document);
    if (pages?.trim()) parts.push(`**Pages**: ${pages}`);
    const alternative = this.getInfoAlternativeTitle(element);
    if (alternative?.trim()) parts.push(`**Alternative title**: ${alternative}`);
    const full = this.getInfoFullTitle(element);
    if (this.shortTitle && full?.trim()) parts.push(`**Full title**: ${full}`);
    return parts.join('\n\n');
  }

  getTime(element: HtmlElement): number {
    return parseDateText(ownText(element.selectFirst('.uploaded')));
  }

  parseMangaDetails(document: HtmlElement): MangaDetails {
    const info = document.selectFirst(this.mangaDetailInfoSelector);
    if (!info) throw new Error('Gallery details not found');
    return {
      url: '',
      title: this.mangaTitle(info, 'h1') ?? '',
      thumbnailUrl: this.getCover(info),
      genres: this.getInfo(info, 'Tags').split(', ').filter(Boolean),
      author: this.getInfo(info, 'Artists') || this.getInfo(info, 'Groups') || undefined,
      description: this.getDescription(info, document) || undefined,
      status: 'completed',
    };
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url));
    return { ...this.parseMangaDetails(document), url: manga.url };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url));
    return this.parseChapterList(document, manga.url);
  }

  parseChapterList(document: HtmlElement, url: string): Chapter[] {
    const info = document.selectFirst(this.mangaDetailInfoSelector);
    return [
      {
        name: 'Chapter',
        url,
        scanlator: (info && this.getInfo(info, 'Groups')) || undefined,
        uploadedAt: this.getTime(document) || undefined,
      },
    ];
  }

  // ============================== Pages ==============================
  pagesRequest = 'inc/thumbs_loader.php';
  galleryIdSelector = 'gallery_id';
  loadIdSelector = 'load_id';
  loadDirSelector = 'load_dir';
  totalPagesSelector = 'load_pages';
  serverSelector = 'load_server';
  thumbnailSelector = '.gallery_thumb';
  serverPrefix = 'm';
  /** Page url: $baseUrl/$pageUri/<id>/<page> */
  pageUri = 'g';
  /**
   * Overwrite to stop converting thumbnails to full images by removing the trailing "t" of the file name.
   * Each page is opened instead and parsed for its image url (slower, but guaranteed). Only applies when the
   * site doesn't provide 'parseJSON'.
   */
  parsingImagePageByPage = false;

  inputIdValueOf(element: HtmlElement, id: string): string {
    return element.selectFirst(`input[id=${id}]`)?.attr('value') ?? '';
  }

  totalPages(element: HtmlElement): string {
    return this.inputIdValueOf(element, this.totalPagesSelector);
  }

  galleryId(element: HtmlElement): string {
    return this.inputIdValueOf(element, this.galleryIdSelector);
  }

  serverNumber(element: HtmlElement): string | undefined {
    return this.inputIdValueOf(element, this.serverSelector) || undefined;
  }

  getServer(element: HtmlElement): string {
    const number = this.serverNumber(element);
    if (number) return `${this.serverPrefix}${number}.${hostOf(this.baseUrl)}`;
    return hostOf(this.getCover(element) ?? '');
  }

  parseJson(element: HtmlElement): string | undefined {
    const script = element.select('script').find((s) => s.html().includes('parseJSON'));
    if (!script) return undefined;
    const data = script.html();
    const after = data.split("$.parseJSON('").slice(1).join("$.parseJSON('");
    return after ? after.split("');")[0]!.trim() : undefined;
  }

  pageRequestForm(document: HtmlElement, totalPages: string, loadedPages: number): Record<string, string> {
    const token = document.selectFirst('[name=csrf-token]')?.attr('content') ?? '';
    const server = this.serverNumber(document);
    const form: Record<string, string> = {
      u_id: this.galleryId(document),
      g_id: this.inputIdValueOf(document, this.loadIdSelector),
      img_dir: this.inputIdValueOf(document, this.loadDirSelector),
      visible_pages: String(loadedPages),
      total_pages: totalPages,
      type: '2', // 1 would be "more", 2 is "all remaining"
    };
    if (token) form._token = token;
    if (server) form.server = server;
    return form;
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, chapter.url));
    return this.pageListParse(document);
  }

  async pageListParse(document: HtmlElement): Promise<Page[]> {
    const json = this.parseJson(document);
    if (json != null) {
      const loadDir = this.inputIdValueOf(document, this.loadDirSelector);
      const loadId = this.inputIdValueOf(document, this.loadIdSelector);
      const pageUrl = `${this.baseUrl}/${this.pageUri}/${this.galleryId(document)}`;
      const imagesUri = `https://${this.getServer(document)}/${loadDir}/${loadId}`;
      try {
        // JSON string in this form: {"1":"j,1100,1148","2":"j,728,689",...
        const images = JSON.parse(json) as Record<string, unknown>;
        const keys = Object.keys(images).sort((a, b) => Number(a) - Number(b));
        return keys.map((key, index): Page => {
          const ext = String(images[key]).split(',')[0];
          const imageExt = { p: 'png', b: 'bmp', g: 'gif', w: 'webp' }[ext as 'p'] ?? 'jpg';
          return { index, imageUrl: `${imagesUri}/${key}.${imageExt}`, url: `${pageUrl}/${Number(key)}/` };
        });
      } catch {
        log.warn('Failed to decode JSON');
      }
    }
    return this.pageListParseAlternative(document);
  }

  /**
   * Either loads all thumbnails and converts them to full images, or lists the page urls that are opened
   * one by one for the image url (see parsingImagePageByPage).
   */
  async pageListParseAlternative(document: HtmlElement): Promise<Page[]> {
    const totalPages = this.totalPages(document);
    const pageUrl = `${this.baseUrl}/${this.pageUri}/${this.galleryId(document)}`;
    if (this.parsingImagePageByPage) {
      return Array.from({ length: Number.parseInt(totalPages, 10) || 0 }, (_, i): Page => ({
        index: i,
        url: `${pageUrl}/${i + 1}/`,
      }));
    }
    const pages: string[] = [];
    for (const a of document.select(`${this.thumbnailSelector} a`)) {
      const src = imgAttr(a.selectFirst('img'));
      if (src) pages.push(src);
    }
    if (totalPages && Number.parseInt(totalPages, 10) > pages.length) {
      const response = await http.post(
        `${this.baseUrl}/${this.pagesRequest}`,
        { form: this.pageRequestForm(document, totalPages, pages.length) },
        { headers: this.xhrHeaders() },
      );
      const more: string[] = [];
      for (const a of html.load(response.body, { baseUrl: this.baseUrl }).select('a')) {
        const src = imgAttr(a.selectFirst('img'));
        if (src) more.push(src);
      }
      if (more.length === 0) return this.pageListParseDummy(document);
      pages.push(...more);
    }
    return pages.map((url, index): Page => ({ index, imageUrl: thumbnailToFull(url) }));
  }

  /** Generates all images from the total page count (they are supposedly sequential). */
  pageListParseDummy(document: HtmlElement): Page[] {
    const loadDir = this.inputIdValueOf(document, this.loadDirSelector);
    const loadId = this.inputIdValueOf(document, this.loadIdSelector);
    const imagesUri = `https://${this.getServer(document)}/${loadDir}/${loadId}`;
    const images = document.select(`${this.thumbnailSelector} img`);
    const thumbs = images.map((img) => imgAttr(img) ?? '');
    const totalPages = Number.parseInt(this.totalPages(document), 10);
    if (!Number.isNaN(totalPages) && totalPages > thumbs.length) {
      const first = imgAttr(images[0]) ?? '';
      const ext = first.slice(first.lastIndexOf('.') + 1);
      for (let i = images.length + 1; i <= totalPages; i++) thumbs.push(`${imagesUri}/${i}t.${ext}`);
    }
    return thumbs.map((url, index): Page => ({ index, imageUrl: thumbnailToFull(url) }));
  }

  async getImageUrl(page: Page): Promise<string> {
    const document = await this.fetchDocument(page.url!);
    return this.imageUrlParse(document);
  }

  imageUrlParse(document: HtmlElement): string {
    return imgAttr(document.selectFirst('img#gimg, img#fimg, img#readerImg')) ?? '';
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  // ============================== Filters ==============================
  supportsFilterFetching = true;
  maxTagPages = 5;
  tagsPath = 'tags/popular';

  /** Tags of a tags page as `[name, uri]`. */
  tagsParser(document: HtmlElement): [string, string][] {
    return document
      .select('a.tag_btn')
      .map((a): [string, string] => [a.selectFirst('.list_tag, .tag_name')?.text() ?? '', last(a.attr('href') ?? '')]);
  }

  async fetchTags(): Promise<Map<string, string>> {
    const tags = new Map<string, string>();
    const pages = await Promise.all(
      Array.from({ length: this.maxTagPages }, (_, i) =>
        this.fetchDocument(this.addPageUri(`${this.baseUrl}/${this.tagsPath}`, i + 1)).catch(() => null),
      ),
    );
    for (const document of pages) {
      if (!document) continue;
      for (const [name, uri] of this.tagsParser(document)) if (name && uri) tags.set(name, uri);
    }
    return tags;
  }

  /** Extra filters shown on top (before the sort order). */
  extraFilters(): Filter[] {
    return [];
  }

  async getFilters(): Promise<Filter[]> {
    const filters: Filter[] = [...this.extraFilters()];
    if (this.useIntermediateSearch)
      filters.push({ type: 'header', label: 'HINT: Separate search term with comma (,)' });
    filters.push({
      type: 'select',
      id: 'sort',
      label: 'Sort By',
      options: this.sortOrderUris().map(([label, value]) => ({ label, value })),
      default: this.sortOrderUris()[0]![1],
    });

    const tags = this.supportsFilterFetching
      ? await this.fetchTags().catch(() => new Map<string, string>())
      : new Map<string, string>();
    if (tags.size > 0) {
      const groups = new Map<string, [string, string][]>();
      for (const entry of [...tags.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
        const c = entry[1][0]?.toUpperCase() ?? '';
        const letter = c >= 'A' && c <= 'Z' ? c : '#';
        groups.set(letter, [...(groups.get(letter) ?? []), entry]);
      }
      filters.push({
        type: 'group',
        id: 'tags-group',
        label: 'Tags',
        filters: [...groups.entries()].map(([letter, entries]): Filter => ({
          type: 'group',
          id: `tags-${letter}`,
          label: letter,
          filters: entries.map(([name, uri]): Filter => ({ type: 'checkbox', id: `tag.${uri}`, label: name })),
        })),
      });
    }

    if (this.useIntermediateSearch || this.supportAdvancedSearch) {
      filters.push(
        { type: 'separator' },
        {
          type: 'group',
          id: 'categories',
          label: 'Categories',
          filters: this.categoryUris().map(([label, uri, def]): Filter => ({
            type: 'checkbox',
            id: `category.${uri}`,
            label,
            default: def ?? true,
          })),
        },
      );
    }

    if (this.supportAdvancedSearch) {
      filters.push(
        { type: 'separator' },
        {
          type: 'header',
          label:
            'Advanced filters will ignore query search. Separate terms by comma (,) and precede term with minus (-) to exclude.',
        },
        { type: 'text', id: 'tags', label: 'Tags' },
        { type: 'text', id: 'parodies', label: 'Parodies' },
        { type: 'text', id: 'artists', label: 'Artists' },
        { type: 'text', id: 'characters', label: 'Characters' },
        { type: 'text', id: 'groups', label: 'Groups' },
      );
    }

    filters.push({ type: 'separator' });
    if (this.supportSpeechless) {
      filters.push({ type: 'checkbox', id: 'speechless', label: 'Show speechless items only' });
    }
    filters.push(
      { type: 'checkbox', id: 'favorites', label: 'Show favorites only (login via WebView)' },
      { type: 'checkbox', id: 'random', label: 'Random manga' },
    );
    return filters;
  }

  resolveUrl(url: string): MangaSummary | null {
    if (hostOf(url) !== hostOf(this.baseUrl)) return null;
    const id = relativeUrl(url).split('/')[2];
    return id && /^\d+$/.test(id) ? { url: `/${this.idPrefixUri}/${id}/`, title: '' } : null;
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return absoluteUrl(this.baseUrl, item.url);
  }

  toSource(): Source {
    return {
      baseUrl: this.baseUrl,
      getPopular: (page) => this.getPopular(page),
      ...(this.supportsLatest() ? { getLatest: (page: number) => this.getLatest(page) } : {}),
      search: (query, page, filters) => this.search(query, page, filters),
      getFilters: () => this.getFilters(),
      getMangaDetails: (manga) => this.getMangaDetails(manga),
      getChapters: (manga) => this.getChapters(manga),
      getPages: (chapter) => this.getPages(chapter),
      getImageUrl: (page) => this.getImageUrl(page),
      imageHeaders: () => this.imageHeaders(),
      resolveUrl: (url) => this.resolveUrl(url),
      getWebUrl: (item) => this.getWebUrl(item),
    };
  }
}
