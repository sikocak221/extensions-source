// MangaThemesia (formerly WPMangaStream & WPMangaReader), ported from keiyoushi/extensions-source
// lib-multisrc/mangathemesia. This file is a template: every extension using the theme keeps an
// identical copy in src/mangathemesia/ (`node scripts/sync-multisrc.mjs` refreshes the copies) and
// overrides members in a subclass, like the Kotlin extensions do.
import {
  type Chapter,
  type Filter,
  type FilterOption,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type MangaType,
  type Page,
  type Preference,
  type Source,
  parseRelativeDate,
} from '@matane/extension-sdk';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

/** Preference behind {@link MangaThemesia.hidePaidChapters} (Kotlin MangaThemesiaPaidChapterHelper). */
export const HIDE_PAID_CHAPTERS_PREFERENCE: Preference = {
  type: 'switch',
  key: 'pref_hide_paid_chapters',
  label: 'Hide paid chapters',
  description: 'Hides chapters that require coins or a subscription.',
  default: true,
};

export interface GenreData {
  name: string;
  value: string;
}

export abstract class MangaThemesia {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  mangaUrlDirectory = '/manga';
  datePattern = 'MMMM d, yyyy';
  projectPageString = '/project';
  hasProjectPage = false;
  supportsLatest = true;

  // Popular / latest: a search with only an order.
  getPopular(page: number): Promise<MangaPage> {
    return this.search('', page, { order: 'popular' });
  }

  getLatest(page: number): Promise<MangaPage> {
    return this.search('', page, { order: 'update' });
  }

  // Search
  searchMangaUrl(page: number, query: string, filters: FilterState): string {
    let directory = this.mangaUrlDirectory;
    const params: [string, string][] = [];
    if (query) params.push(['title', query]);
    params.push(['page', String(page)]);

    const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string).trim() : '');
    if (text('author')) params.push(['author', text('author')]);
    if (text('year')) params.push(['yearx', text('year')]);
    params.push(['status', text('status')]);
    params.push(['type', text('type')]);
    params.push(['order', text('order')]);
    for (const [id, value] of Object.entries(filters)) {
      if (!id.startsWith('genre.')) continue;
      const genre = id.slice('genre.'.length);
      if (value === 'include' || value === true) params.push(['genre[]', genre]);
      else if (value === 'exclude') params.push(['genre[]', `-${genre}`]);
    }
    if (this.hasProjectPage && filters.project === 'project-filter-on') directory = this.projectPageString;

    return `${this.baseUrl}${directory}/?${params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}`;
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    return this.searchMangaParse(await this.fetchDocument(this.searchMangaUrl(page, query.trim(), filters)));
  }

  searchMangaParse(document: HtmlElement): MangaPage {
    const items = document
      .select(this.searchMangaSelector())
      .map((element) => this.searchMangaFromElement(element))
      .filter((manga) => manga.url && manga.title);
    const selector = this.searchMangaNextPageSelector();
    return { items, hasNextPage: selector != null && document.selectFirst(selector) != null };
  }

  searchMangaSelector(): string {
    return '.utao .uta .imgu, .listupd .bs .bsx, .listo .bs .bsx';
  }

  searchMangaFromElement(element: HtmlElement): MangaSummary {
    const link = element.selectFirst('a');
    return {
      url: this.toRelative(link?.attr('href') ?? ''),
      title: (link?.attr('title') ?? '').trim(),
      thumbnailUrl: this.imgAttr(element.selectFirst('img')) || undefined,
    };
  }

  searchMangaNextPageSelector(): string | null {
    return 'div.pagination .next, div.hpage .r';
  }

  // Manga details
  seriesDetailsSelector = 'div.bigcontent, div.animefull, div.main-info, div.postbody';
  seriesTitleSelector = '.entry-title, .ts-breadcrumb li:last-child span';
  seriesArtistSelector = labelled(
    '.infotable tr:contains(%s) td:last-child, .tsinfo .imptdt:contains(%s) i, .fmed b:contains(%s)+span, span:contains(%s)',
    ['artist', 'Artiste', 'Artista', 'الرسام', 'الناشر', 'İllüstratör', 'Çizer', 'Sanatçı'],
  );
  seriesAuthorSelector = labelled(
    '.infotable tr:contains(%s) td:last-child, .tsinfo .imptdt:contains(%s) i, .fmed b:contains(%s)+span, span:contains(%s)',
    ['Author', 'Auteur', 'autor', 'المؤلف', 'Mangaka', 'seniman', 'Pengarang', 'Yazar'],
  );
  seriesDescriptionSelector = '.desc, .entry-content[itemprop=description]';
  seriesAltNameSelector =
    '.alternative, .wd-full:contains(alt) span, .alter, .seriestualt, ' +
    labelled('.infotable tr:contains(%s) td:last-child', ['Alternative', 'Alternatif', 'الأسماء الثانوية']);
  seriesGenreSelector = 'div.gnr a, .mgen a, .seriestugenre a, ' + labelled('span:contains(%s)', ['genre', 'التصنيف']);
  seriesTypeSelector =
    labelled(
      '.infotable tr:contains(%s) td:last-child, .tsinfo .imptdt:contains(%s) i, .tsinfo .imptdt:contains(%s) a, .fmed b:contains(%s)+span, span:contains(%s) a',
      ['type', 'ประเภท', 'النوع', 'tipe', 'Türü'],
    ) + ', a[href*="type="]';
  seriesStatusSelector = labelled(
    '.infotable tr:contains(%s) td:last-child, .tsinfo .imptdt:contains(%s) i, .fmed b:contains(%s)+span span:contains(%s)',
    ['status', 'Statut', 'Durum', '連載状況', 'Estado', 'الحالة', 'حالة العمل', 'สถานะ', 'stato', 'Statüsü'],
  );
  seriesThumbnailSelector = '.infomanga > div[itemprop=image] img, .thumb img';
  altNamePrefix = 'Alternative Name(s): ';

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const response = await http.get(this.absolute(manga.url), { headers: this.headers() });
    // Long chapter lists make the case-insensitive label lookups slow, and details never need them.
    const body = stripChapterList(response.body);
    return this.mangaDetailsParse(html.load(body, { baseUrl: response.url }), manga);
  }

  mangaDetailsParse(document: HtmlElement, manga: MangaSummary): MangaDetails {
    const details: MangaDetails = { url: manga.url, title: manga.title, status: 'unknown' };
    const series = document.selectFirst(this.seriesDetailsSelector);
    if (!series) return details;

    details.title = series.selectFirst(this.seriesTitleSelector)?.text() || manga.title;
    details.artist = removeEmptyPlaceholder(ownText(this.selectLabelled(series, this.seriesArtistSelector)));
    details.author = removeEmptyPlaceholder(ownText(this.selectLabelled(series, this.seriesAuthorSelector)));
    let description = series.selectFirst(this.seriesDescriptionSelector)?.text() || undefined;
    const altName = ownText(this.selectLabelled(series, this.seriesAltNameSelector));
    if (altName.trim()) {
      const names = altName
        .split(/[|/•,;]/)
        .map((name) => `- ${name.trim()}`)
        .join('\n');
      description = `${description ? `${description}\n\n` : ''}${`${this.altNamePrefix}\n${names}`.trim()}`;
    }
    details.description = description;

    const genres = this.selectAllLabelled(series, this.seriesGenreSelector).map((el) => el.text());
    const type = ownText(this.selectLabelled(series, this.seriesTypeSelector)).trim();
    if (type) genres.push(type);
    details.genres = unique(genres.map((genre) => capitalize(genre.trim())).filter(Boolean));
    details.type = parseType(type);
    details.status = this.parseStatus(this.selectLabelled(series, this.seriesStatusSelector)?.text());
    details.thumbnailUrl = this.imgAttr(series.selectFirst(this.seriesThumbnailSelector)) || manga.thumbnailUrl;
    return details;
  }

  parseStatus(text: string | undefined | null): MangaStatus {
    return parseStatus(text);
  }

  // Chapters
  chapterListSelector(): string {
    return 'div.bxcl li, div.cl li, #chapterlist li, ul li:has(div.chbox):has(div.eph-num)';
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const document = await this.fetchDocument(this.absolute(manga.url));
    // Loading a long page takes a while: start a new time slice (the sandbox allows 2 s without yielding).
    await timers.sleep(0);
    return this.chapterListParse(document);
  }

  async chapterListParse(document: HtmlElement): Promise<Chapter[]> {
    const chapters: Chapter[] = [];
    const elements = document.select(this.chapterListSelector());
    for (let i = 0; i < elements.length; i++) {
      // Yield now and then: the sandbox stops code that runs for 2 s without yielding.
      if (i % 300 === 0) await timers.sleep(0);
      const chapter = this.chapterFromElement(elements[i]!);
      if (chapter.url) chapters.push(chapter);
    }

    // Sites without chapter dates get at least one, from "Updated On".
    const first = chapters[0];
    if (first && first.uploadedAt === undefined) {
      const date = document
        .selectFirst('.listinfo time[itemprop=dateModified], .fmed:contains(update) time, span:contains(update) time')
        ?.attr('datetime');
      if (date) first.uploadedAt = parseDate(date.slice(0, 10), 'yyyy-MM-dd');
    }
    return chapters;
  }

  chapterFromElement(element: HtmlElement): Chapter {
    const link = element.selectFirst('a');
    const name =
      element
        .select('.lch a, .chapternum')
        .map((el) => el.text())
        .join(' ')
        .trim() ||
      link?.text() ||
      '';
    return {
      url: this.toRelative(link?.attr('href') ?? ''),
      name,
      uploadedAt: this.parseChapterDate(element.selectFirst('.chapterdate')?.text()),
    };
  }

  parseChapterDate(text: string | undefined | null): number | undefined {
    if (!text) return undefined;
    return parseDate(text, this.datePattern) ?? parseRelativeDate(text);
  }

  lockedChapterSelector = "a[data-bs-target='#lockedChapterModal']";

  /** Leaves locked chapters out of a chapter selector unless the user turned the preference off. */
  hidePaidChapters(selector: string): string {
    if (prefs.get<boolean>(HIDE_PAID_CHAPTERS_PREFERENCE.key) === false) return selector;
    const locked = this.lockedChapterSelector;
    return selector
      .split(', ')
      .map((part) => `${part}:not(${locked}):not(:has(${locked}))`)
      .join(', ');
  }

  // Pages
  pageSelector = 'div#readerarea img';

  async getPages(chapter: Chapter): Promise<Page[]> {
    const response = await http.get(this.absolute(chapter.url), { headers: this.headers() });
    return this.pageListParse(html.load(response.body, { baseUrl: response.url }), response.body);
  }

  pageListParse(document: HtmlElement, body: string): Page[] {
    const htmlPages = document
      .select(this.pageSelector)
      .map((img) => this.imgAttr(img))
      .filter(Boolean)
      .map((imageUrl, index) => ({ index, imageUrl }));
    // Some sites load the pages with javascript.
    if (htmlPages.length > 0) return htmlPages;

    // "ts_reader.run({" in base64
    const script = document.selectFirst('script[src^="data:text/javascript;base64,dHNfcmVhZGVyLnJ1bih7"]');
    const source = script ? base64.decode((script.attr('src') ?? '').split('base64,')[1] ?? '') : body;
    const json = /["']?(?:images|imageUrls)["']?\s*[:=]\s*(\[.*?])/s.exec(source)?.[1];
    let images: string[] = [];
    try {
      images = json ? (JSON.parse(json) as string[]) : [];
    } catch {
      images = [];
    }
    return images.map((url, index) => ({ index, imageUrl: this.absolute(url) }));
  }

  imageHeaders(): Record<string, string> {
    return { ...this.headers(), Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*' };
  }

  // Filters
  statusOptions: FilterOption[] = [
    { label: 'All', value: '' },
    { label: 'Ongoing', value: 'ongoing' },
    { label: 'Completed', value: 'completed' },
    { label: 'Hiatus', value: 'hiatus' },
    { label: 'Dropped', value: 'dropped' },
  ];

  typeFilterOptions: FilterOption[] = [
    { label: 'All', value: '' },
    { label: 'Manga', value: 'Manga' },
    { label: 'Manhwa', value: 'Manhwa' },
    { label: 'Manhua', value: 'Manhua' },
    { label: 'Comic', value: 'Comic' },
  ];

  orderByFilterOptions: FilterOption[] = [
    { label: 'Default', value: '' },
    { label: 'A-Z', value: 'title' },
    { label: 'Z-A', value: 'titlereverse' },
    { label: 'Latest Update', value: 'update' },
    { label: 'Latest Added', value: 'latest' },
    { label: 'Popular', value: 'popular' },
  ];

  projectFilterOptions: FilterOption[] = [
    { label: 'All manga', value: '' },
    { label: 'Only project', value: 'project-filter-on' },
  ];

  async getFilters(): Promise<Filter[]> {
    let genres: GenreData[] = [];
    try {
      genres = this.parseGenres(await this.fetchDocument(`${this.baseUrl}${this.mangaUrlDirectory}/`));
    } catch (error) {
      log.warn('Cannot load genres', error);
    }

    const filters: Filter[] = [
      { type: 'text', id: 'author', label: 'Author' },
      { type: 'text', id: 'year', label: 'Year' },
      { type: 'select', id: 'status', label: 'Status', options: this.statusOptions },
      { type: 'select', id: 'type', label: 'Type', options: this.typeFilterOptions },
      { type: 'select', id: 'order', label: 'Order by', options: this.orderByFilterOptions },
    ];
    if (genres.length > 0) {
      filters.push(
        { type: 'header', label: 'Genre exclusion is not available on every site' },
        {
          type: 'group',
          id: 'genre',
          label: 'Genre',
          filters: genres.map((genre) => ({ type: 'tristate', id: `genre.${genre.value}`, label: genre.name })),
        },
      );
    }
    if (this.hasProjectPage) {
      filters.push(
        { type: 'separator' },
        { type: 'header', label: 'Text search ignores project filter' },
        { type: 'select', id: 'project', label: `${this.name} project list page`, options: this.projectFilterOptions },
      );
    }
    return filters;
  }

  parseGenres(document: HtmlElement): GenreData[] {
    return document
      .select('ul.genrez li')
      .map((li) => ({
        name: li.selectFirst('label')?.text() ?? '',
        value: li.selectFirst('input[type=checkbox]')?.attr('value') ?? '',
      }))
      .filter((genre) => genre.name && genre.value);
  }

  // URLs
  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)([^?#]*)/i.exec(url.trim());
    if (!match || match[1] !== hostOf(this.baseUrl)) return null;
    const segments = (match[2] ?? '').split('/').filter(Boolean);
    if (segments.length !== 2) return null;
    // Keep the site's own form (with or without the trailing slash) so it matches listed urls.
    return { url: `/${segments.join('/')}${(match[2] ?? '').endsWith('/') ? '/' : ''}`, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return this.absolute(item.url);
  }

  // Helpers
  userAgent = USER_AGENT;

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  async fetchDocument(url: string): Promise<HtmlElement> {
    const response = await http.get(url, { headers: this.headers() });
    return html.load(response.body, { baseUrl: response.url });
  }

  absolute(url: string): string {
    if (/^https?:\/\//.test(url)) return url;
    if (url.startsWith('//')) return `https:${url}`;
    return `${this.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  /** Path (+ query) of a link on the site, like Tachiyomi's setUrlWithoutDomain. */
  toRelative(url: string): string {
    const value = url.trim().replace(/#.*$/, '');
    if (!value) return '';
    const path = value.replace(/^(?:https?:)?\/\/[^/?#]+/i, '');
    return path.startsWith('/') ? path : `/${path}`;
  }

  imgAttr(element: HtmlElement | null | undefined): string {
    if (!element) return '';
    for (const name of ['data-lazy-src', 'data-src', 'data-cfsrc', 'src']) {
      const value = element.attr(name);
      if (value && value.trim()) return element.absUrl(name) || value.trim();
    }
    return '';
  }

  /** First match of a selector that may use the case-insensitive `:contains(...)` of Jsoup. */
  selectLabelled(root: HtmlElement, selector: string): HtmlElement | null {
    return this.selectAllLabelled(root, selector)[0] ?? null;
  }

  selectAllLabelled(root: HtmlElement, selector: string): HtmlElement[] {
    return selectIgnoreCase(root, selector);
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
// Jsoup compatibility helpers (cheerio's `:contains` is case-sensitive and there is no ownText()).

/** Expands "%s" once per label, joined as a selector list (Kotlin `selector(selector, contains)`). */
export function labelled(selector: string, labels: string[]): string {
  return labels.map((label) => selector.split('%s').join(label)).join(', ');
}

export function hostOf(url: string): string {
  return /^(?:https?:)?\/\/([^/?#]+)/i.exec(url)?.[1]?.toLowerCase() ?? '';
}

/**
 * Runs a selector list where `:contains(x)` matches case-insensitively, as in Jsoup. Each selector
 * of the list containing `:contains` is tried in the case variants that occur on real sites.
 */
export function selectIgnoreCase(root: HtmlElement, selector: string): HtmlElement[] {
  const parts = splitSelectorList(selector);
  const plain = parts.filter((part) => !part.includes(':contains('));
  const variants = new Set<string>(plain);
  for (const part of parts.filter((p) => p.includes(':contains('))) {
    for (const transform of [
      (s: string) => s,
      (s: string) => s.toLowerCase(),
      (s: string) => s.toUpperCase(),
      (s: string) => capitalize(s.toLowerCase()),
    ]) {
      variants.add(part.replace(/:contains\(([^)]*)\)/g, (_, text: string) => `:contains(${transform(text)})`));
    }
  }
  const all = [...variants];
  if (all.length === 0) return [];
  try {
    return root.select(all.join(', '));
  } catch {
    return all.flatMap((part) => {
      try {
        return root.select(part);
      } catch {
        return [];
      }
    });
  }
}

function splitSelectorList(selector: string): string[] {
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

/** Removes the MangaThemesia chapter list (`#chapterlist`) from a page's html. */
export function stripChapterList(body: string): string {
  const marker = body.search(/id=["']chapterlist["']/);
  if (marker < 0) return body;
  const start = body.lastIndexOf('<', marker);
  const end = body.indexOf('</ul>', marker);
  if (start < 0 || end < 0) return body;
  return body.slice(0, start) + body.slice(end + 5);
}

/** Text of the element without the text of its child elements (Jsoup ownText). */
export function ownText(element: HtmlElement | null | undefined): string {
  if (!element) return '';
  const inner = element
    .html()
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    // Drop child elements with their content, innermost first.
    .replace(/<!--[\s\S]*?-->/g, '');
  let text = inner;
  let previous;
  do {
    previous = text;
    text = text.replace(/<([a-zA-Z][\w-]*)\b[^>]*>[^<]*<\/\1\s*>/g, ' ');
  } while (text !== previous);
  text = text.replace(/<[^>]+>/g, ' ');
  return decodeEntities(text).replace(/\s+/g, ' ').trim();
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

export function removeEmptyPlaceholder(text: string | undefined | null): string | undefined {
  const value = text?.trim();
  if (!value || ['-', 'N/A', 'n/a', 'Unknown'].includes(value)) return undefined;
  return value;
}

export function capitalize(text: string): string {
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function parseType(text: string | undefined | null): MangaType | undefined {
  const value = text?.toLowerCase() ?? '';
  if (value.includes('manhwa')) return 'manhwa';
  if (value.includes('manhua')) return 'manhua';
  if (value.includes('manga')) return 'manga';
  if (value.includes('comic') || value.includes('komik')) return 'comic';
  return undefined;
}

const ONGOING = [
  'مستمرة', 'en curso', 'ongoing', 'on going', 'new season', 'mass released', 'ativo', 'en cours', 'en cours de publication',
  'đang tiến hành', 'em lançamento', 'онгоінг', 'publishing', 'devam ediyor', 'em andamento', 'in corso', 'güncel',
  'berjalan', 'продолжается', 'updating', 'lançando', 'in arrivo', 'emision', 'en emision', 'مستمر', 'curso',
  'en marcha', 'publicandose', 'publicando', '连载中', 'devam etmekte', '連載中',
]; // prettier-ignore
const COMPLETED = [
  'completed', 'completo', 'complété', 'fini', 'achevé', 'terminé', 'tamamlandı', 'đã hoàn thành', 'hoàn thành',
  'مكتملة', 'завершено', 'finished', 'finalizad', 'completata', 'one-shot', 'bitti', 'tamat', 'completado',
  'concluído', '完結', 'concluido', '已完结', 'bitmiş',
]; // prettier-ignore
const CANCELLED = [
  'canceled',
  'cancelled',
  'cancelado',
  'cancellato',
  'cancelados',
  'dropped',
  'discontinued',
  'abandonné',
];
const HIATUS = ['hiatus', 'on hold', 'season end', 'pausado', 'en espera', 'en pause', 'en attente', 'hiato'];

export function parseStatus(text: string | undefined | null): MangaStatus {
  if (!text) return 'unknown';
  const value = text.toLowerCase();
  if (ONGOING.some((s) => value.includes(s))) return 'ongoing';
  if (COMPLETED.some((s) => value.includes(s))) return 'completed';
  if (CANCELLED.some((s) => value.includes(s))) return 'cancelled';
  if (HIATUS.some((s) => value.includes(s))) return 'hiatus';
  return 'unknown';
}

// Month names (full and short) in the languages these sites use.
const MONTHS: Record<string, number> = {};
[
  ['january', 'jan', 'januari', 'enero', 'janvier', 'janeiro'],
  ['february', 'feb', 'februari', 'febrero', 'février', 'fevereiro', 'pebruari'],
  ['march', 'mar', 'maret', 'marzo', 'mars', 'março'],
  ['april', 'apr', 'abril', 'avril'],
  ['may', 'mei', 'mayo', 'mai', 'maio'],
  ['june', 'jun', 'juni', 'junio', 'juin', 'junho'],
  ['july', 'jul', 'juli', 'julio', 'juillet', 'julho'],
  ['august', 'aug', 'agustus', 'agu', 'agt', 'agosto', 'août', 'ago'],
  ['september', 'sep', 'sept', 'septiembre', 'septembre', 'setembro'],
  ['october', 'oct', 'oktober', 'okt', 'octubre', 'octobre', 'outubro', 'out'],
  ['november', 'nov', 'noviembre', 'novembre', 'novembro', 'nop'],
  ['december', 'dec', 'desember', 'des', 'diciembre', 'décembre', 'dezembro', 'dez'],
].forEach((names, month) => {
  for (const name of names) MONTHS[name] = month;
});

/**
 * Parses a date written with a Java DateTimeFormatter pattern subset (d, dd, M, MM, MMM, MMMM, yy,
 * yyyy, H/HH, mm; other letters are skipped, literals must match loosely). Epoch ms in UTC, or
 * undefined.
 */
export function parseDate(text: string, pattern: string): number | undefined {
  const tokens = pattern.match(/(d+|M+|y+|H+|h+|m+|s+|a|E+|'[^']*'|[^dMyHhmsaE']+)/g) ?? [];
  let regex = '';
  const fields: string[] = [];
  for (const token of tokens) {
    const letter = token[0];
    if (letter === "'") regex += escapeRegex(token.slice(1, -1));
    else if (letter === 'M' && token.length >= 3) {
      regex += '([^\\s\\d.,/-]+)\\.?';
      fields.push('monthName');
    } else if (letter === 'E') {
      regex += '[^\\s\\d.,]+';
    } else if (letter === 'a') {
      regex += '([ap]\\.?m\\.?)';
      fields.push('ampm');
    } else if ('dMyHhms'.includes(letter ?? '')) {
      regex += '(\\d{1,4})';
      fields.push(letter ?? '');
    } else regex += escapeRegex(token).replace(/\s+/g, '\\s*');
  }
  const match = new RegExp(regex, 'i').exec(text.trim());
  if (!match) return undefined;

  let year = 1970;
  let month = 0;
  let day = 1;
  let hour = 0;
  let minute = 0;
  let second = 0;
  let pm: boolean | undefined;
  fields.forEach((field, i) => {
    const value = match[i + 1] ?? '';
    const number = Number.parseInt(value, 10);
    if (field === 'monthName') {
      const name = value.toLowerCase().replace(/\.$/, '');
      month = MONTHS[name] ?? MONTHS[name.slice(0, 3)] ?? Number.NaN;
    } else if (field === 'M') month = number - 1;
    else if (field === 'd') day = number;
    else if (field === 'y') year = value.length <= 2 ? 2000 + number : number;
    else if (field === 'H' || field === 'h') hour = number;
    else if (field === 'm') minute = number;
    else if (field === 's') second = number;
    else if (field === 'ampm') pm = value.toLowerCase().startsWith('p');
  });
  if (pm !== undefined && hour < 12 && pm) hour += 12;
  if (pm === false && hour === 12) hour = 0;
  const time = Date.UTC(year, month, day, hour, minute, second);
  return Number.isNaN(time) ? undefined : time;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
