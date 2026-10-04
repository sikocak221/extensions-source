// Madara (WordPress "WP Manga" theme), ported from keiyoushi/extensions-source lib-multisrc/madara.
// This directory is a template: every extension using the theme keeps an identical copy in src/madara/
// (`node scripts/sync-multisrc.mjs` refreshes the copies) and overrides members in a subclass, like the
// Kotlin extensions do.
//
// Unlike the Kotlin version (post ids + memo), manga urls are the manga page path ("/manga/slug/") and
// chapter urls the chapter page path ("/manga/slug/chapter-1/").
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
  type Page,
  type Source,
  parseRelativeDate,
} from '@matane/extension-sdk';
import { md5Bytes } from './md5';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

export type ChapterMode = 'MangaPage' | 'AdminAjax' | 'MangaAjax' | 'MangaAjaxPaginated' | 'MangaAjaxQuery';

export interface GenreRoute {
  name: string;
  slug: string;
  path: string;
}

export abstract class MadaraBase {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;
  chapterMode: ChapterMode = 'MangaPage';
  mangaSubString = 'manga';
  genreDirectory = 'manga-genre';
  filterNonMangaItems = true;
  supportsLatest = true;

  abstract getPopular(page: number): Promise<MangaPage>;
  abstract getLatest(page: number): Promise<MangaPage>;
  abstract search(query: string, page: number, filters: FilterState): Promise<MangaPage>;
  abstract getFilters(): Promise<Filter[]>;

  statusFilterOptions: FilterOption[] = [
    { label: 'Completed', value: 'end' },
    { label: 'Ongoing', value: 'on-going' },
    { label: 'Canceled', value: 'canceled' },
    { label: 'On Hold', value: 'on-hold' },
  ];

  orderByFilterOptions: FilterOption[] = [
    { label: 'Relevance', value: '' },
    { label: 'Latest', value: 'latest' },
    { label: 'A-Z', value: 'alphabet' },
    { label: 'Rating', value: 'rating' },
    { label: 'Trending', value: 'trending' },
    { label: 'Most Views', value: 'views' },
    { label: 'New', value: 'new-manga' },
  ];

  genreConditionFilterOptions: FilterOption[] = [
    { label: 'OR', value: '' },
    { label: 'AND', value: '1' },
  ];

  adultFilterOptions: FilterOption[] = [
    { label: 'All', value: '' },
    { label: 'None', value: '0' },
    { label: 'Only', value: '1' },
  ];

  // Selectors
  archiveSelector(): string {
    return 'div.page-item-detail, .manga__item, .c-tabs-item__content';
  }

  searchCardSelector(): string {
    return '.c-tabs-item__content';
  }

  archiveTitleSelector: string | null = null;
  archiveUrlSelector = '.post-title a';
  mangaDetailsSelectorTitle = 'div.post-title h3, div.post-title h1, #manga-title > h1';
  mangaDetailsSelectorAuthor = 'div.author-content > a, div.manga-authors > a';
  mangaDetailsSelectorArtist = 'div.artist-content > a';
  mangaDetailsSelectorStatus = 'div.summary-content, div.summary-heading:contains(Status) + div';
  mangaDetailsSelectorDescription =
    'div.description-summary div.summary__content, div.summary_content div.post-content_item > h5 + div, div.summary_content div.manga-excerpt';
  mangaDetailsSelectorThumbnail = 'div.summary_image img';
  mangaDetailsSelectorGenre = 'div.genres-content a';
  mangaDetailsSelectorTag = 'div.tags-content a';
  seriesTypeSelector = '.post-content_item:contains(Type) .summary-content';
  altNameSelector = '.post-content_item:contains(Alt) .summary-content';
  updatingRegex = /Updating|Atualizando/i;
  altNamePrefix = 'Alternative Names:';

  chapterListSelector(): string {
    return 'li.wp-manga-chapter';
  }

  chapterNameSelector: string | null = null;
  chapterUrlSelector = 'a';
  chapterDateSelector = 'span.chapter-release-date';
  chapterDatePattern = 'MMMM d, yyyy';
  pageListParseSelector =
    'div.page-break, li.blocks-gallery-item, .reading-content .text-left:not(:has(.blocks-gallery-item))';
  filterGenresSelector = 'div.genres';

  // Genres for the filters
  async fetchGenres(): Promise<GenreRoute[]> {
    try {
      const document = await this.fetchDocument(`${this.baseUrl}/${this.mangaSubString}/`);
      const seen = new Set<string>();
      return document
        .select(descendants(this.filterGenresSelector, `a[href*='/${this.genreDirectory}/']`))
        .flatMap((element): GenreRoute[] => {
          const href = element.absUrl('href') || element.attr('href') || '';
          const path = pathOf(href);
          const name = element.text();
          const slug = path.replace(/\/+$/, '').split('/').pop() ?? '';
          if (!name || !slug || seen.has(slug)) return [];
          seen.add(slug);
          return [{ name, slug, path }];
        });
    } catch (error) {
      log.warn('Cannot load genres', error);
      return [];
    }
  }

  // Listing
  parseArchive(document: HtmlElement): MangaSummary[] {
    return document
      .select(this.archiveSelector())
      .map((element) => this.archiveManga(element))
      .filter((manga): manga is MangaSummary => manga !== null);
  }

  archiveManga(element: HtmlElement): MangaSummary | null {
    const link = element.selectFirst(this.archiveUrlSelector);
    const href = link?.absUrl('href') || link?.attr('href');
    if (!link || !href) return null;
    const title =
      (this.archiveTitleSelector ? element.selectFirst(this.archiveTitleSelector)?.text() : null) ?? link.text();
    return {
      url: pathOf(href),
      title,
      thumbnailUrl: this.processThumbnail(this.imageFromElement(element.selectFirst('img')), true) || undefined,
    };
  }

  parseSearchCards(document: HtmlElement): MangaSummary[] {
    return document
      .select(this.searchCardSelector())
      .map((element) => this.archiveManga(element))
      .filter((manga): manga is MangaSummary => manga !== null);
  }

  // Details
  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const { document, path } = await this.fetchMangaPage(manga);
    return this.parseDetails(document, path, manga);
  }

  parseDetails(document: HtmlElement, path: string, manga: MangaSummary): MangaDetails {
    const texts = (selector: string) =>
      selectIgnoreCase(document, selector)
        .map((el) => el.text())
        .filter((text) => text && !this.isUpdating(text));

    const details: MangaDetails = {
      url: path || manga.url,
      title: ownText(document.selectFirst(this.mangaDetailsSelectorTitle)) || manga.title,
      status: 'unknown',
    };
    details.author = texts(this.mangaDetailsSelectorAuthor).join(', ') || undefined;
    details.artist = texts(this.mangaDetailsSelectorArtist).join(', ') || undefined;

    const descriptionElement = document.selectFirst(this.mangaDetailsSelectorDescription);
    if (descriptionElement) {
      const paragraphs = descriptionElement.select('p').map((p) => p.text());
      details.description = (paragraphs.length > 0 ? paragraphs.join('\n\n') : descriptionElement.text()) || undefined;
    }
    const alternative = ownText(selectIgnoreCase(document, this.altNameSelector)[0]);
    if (alternative && !this.isUpdating(alternative)) {
      details.description = [details.description, `${this.altNamePrefix} ${alternative}`].filter(Boolean).join('\n\n');
    }
    details.thumbnailUrl =
      this.processThumbnail(this.imageFromElement(document.selectFirst(this.mangaDetailsSelectorThumbnail))) ||
      manga.thumbnailUrl;
    // A labelled match ("Status" heading) beats the generic last ".summary-content".
    const labelled = splitSelectorList(this.mangaDetailsSelectorStatus).filter((part) => part.includes(':contains('));
    const statuses = labelled.length > 0 ? selectIgnoreCase(document, labelled.join(', ')) : [];
    const statusElements = statuses.length > 0 ? statuses : selectIgnoreCase(document, this.mangaDetailsSelectorStatus);
    details.status = this.toStatus(statusElements[statusElements.length - 1]?.text() ?? '');

    const type = selectIgnoreCase(document, this.seriesTypeSelector)[0]?.text();
    const genres = [
      ...document.select(this.mangaDetailsSelectorGenre).map((el) => el.text()),
      ...document.select(this.mangaDetailsSelectorTag).map((el) => el.text()),
      ...(type ? [type] : []),
    ].filter(Boolean);
    const seen = new Set<string>();
    details.genres = genres.filter((genre) => !seen.has(genre.toLowerCase()) && seen.add(genre.toLowerCase()));
    const lowerType = type?.toLowerCase() ?? '';
    if (lowerType.includes('manhwa')) details.type = 'manhwa';
    else if (lowerType.includes('manhua')) details.type = 'manhua';
    else if (lowerType.includes('manga')) details.type = 'manga';
    return details;
  }

  completedStatus = [
    'completed', 'completo', 'completado', 'concluído', 'concluido', 'finalizado', 'achevé', 'terminé', 'hoàn thành',
    'مكتملة', 'مكتمل', '已完结', 'tamamlandı', 'đã hoàn thành', 'завершено', 'tamamlanan', 'complété', 'tamat',
  ]; // prettier-ignore
  ongoingStatus = [
    'ongoing', 'on going', 'updating', 'продолжается', 'em lançamento', 'em andamento', 'en cours', 'ativo', 'lançando',
    'đang tiến hành', 'còn nữa', 'devam ediyor', 'in corso', 'in arrivo', 'مستمرة', 'مستمر', 'en curso', 'emision',
    'curso', 'en marcha', 'publicandose', 'publicándose', 'en emision', '连载中', 'đang làm', 'em postagem',
    'devam eden', 'em progresso', 'atualizações semanais', 'виходить', 'berjalan',
  ]; // prettier-ignore
  hiatusStatus = [
    'on hold', 'hiatus', 'pausado', 'en espera', 'durduruldu', 'beklemede', 'đang chờ', 'متوقف', 'en pause',
    'заморожено', 'en attente',
  ]; // prettier-ignore
  cancelledStatus = [
    'canceled',
    'cancelled',
    'cancelado',
    'iptal edildi',
    'đã hủy',
    'ملغي',
    'abandonné',
    'заброшено',
    'annulé',
  ];

  toStatus(text: string): MangaStatus {
    const value = text.toLowerCase();
    if (this.completedStatus.some((s) => value.includes(s))) return 'completed';
    if (this.ongoingStatus.some((s) => value.includes(s))) return 'ongoing';
    if (this.hiatusStatus.some((s) => value.includes(s))) return 'hiatus';
    if (this.cancelledStatus.some((s) => value.includes(s))) return 'cancelled';
    return 'unknown';
  }

  isUpdating(value: string): boolean {
    return this.updatingRegex.test(value);
  }

  // Chapters
  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    if (
      this.chapterMode === 'MangaAjax' ||
      this.chapterMode === 'MangaAjaxPaginated' ||
      this.chapterMode === 'MangaAjaxQuery'
    ) {
      return this.fetchChapters(manga.url, null);
    }
    const { document, path } = await this.fetchMangaPage(manga);
    return this.fetchChapters(path, document);
  }

  async fetchChapters(mangaPath: string, mangaPage: HtmlElement | null): Promise<Chapter[]> {
    switch (this.chapterMode) {
      case 'MangaPage':
        return this.parseChapterList(mangaPage!, mangaPath);
      case 'AdminAjax': {
        const id = mangaPage ? mangaIdOf(mangaPage) : null;
        if (!id) throw new Error('Missing Madara post id');
        const response = await http.post(
          `${this.baseUrl}/wp-admin/admin-ajax.php`,
          { form: { action: 'manga_get_chapters', manga: id } },
          { headers: this.xhrHeaders() },
        );
        return this.parseChapterList(html.load(response.body, { baseUrl: this.baseUrl }), mangaPath);
      }
      case 'MangaAjax': {
        const response = await http.post(this.chapterAjaxUrl(mangaPath), { form: {} }, { headers: this.xhrHeaders() });
        return this.parseChapterList(html.load(response.body, { baseUrl: this.baseUrl }), mangaPath);
      }
      case 'MangaAjaxPaginated': {
        const result: Chapter[] = [];
        let lastUrl: string | undefined;
        for (let page = 1; page < 500; page++) {
          const response = await http.request<string>({
            url: `${this.chapterAjaxUrl(mangaPath)}?t=${page}`,
            method: 'POST',
            body: { form: {} },
            headers: this.xhrHeaders(),
          });
          if (response.status === 404) break;
          if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
          const chapters = await this.parseChapterList(html.load(response.body, { baseUrl: this.baseUrl }), mangaPath);
          if (chapters.length === 0 || chapters[chapters.length - 1]!.url === lastUrl) break;
          result.push(...chapters);
          lastUrl = chapters[chapters.length - 1]!.url;
        }
        return result;
      }
      case 'MangaAjaxQuery': {
        const slug = mangaPath.replace(/\/+$/, '').split('/').pop() ?? '';
        const response = await http.post(
          `${this.baseUrl}/index.php`,
          { form: { 'manga-core': slug, manga_ajax: '1', maction: 'get_chapters' } },
          { headers: this.xhrHeaders() },
        );
        return this.parseChapterList(html.load(response.body, { baseUrl: this.baseUrl }), mangaPath);
      }
    }
  }

  chapterAjaxUrl(mangaPath: string): string {
    return `${this.baseUrl}${mangaPath.replace(/\/+$/, '')}/ajax/chapters/`;
  }

  async parseChapterList(document: HtmlElement, mangaPath: string): Promise<Chapter[]> {
    const chapters: Chapter[] = [];
    // Yield now and then: the sandbox stops code that runs for 2 s without yielding.
    await timers.sleep(0);
    const elements = document.select(this.chapterListSelector());
    for (let i = 0; i < elements.length; i++) {
      if (i % 300 === 0) await timers.sleep(0);
      const chapter = this.chapterFromElement(elements[i]!, mangaPath);
      if (chapter) chapters.push(chapter);
    }
    return chapters;
  }

  chapterFromElement(element: HtmlElement, _mangaPath: string): Chapter | null {
    const link = element.selectFirst(this.chapterUrlSelector);
    const raw = link?.attr('href')?.trim() ?? '';
    // Locked (premium) chapters link to "#".
    if (!link || !raw || raw.startsWith('#') || raw.startsWith('javascript:')) return null;
    const href = link.absUrl('href') || raw;
    const name =
      (this.chapterNameSelector ? element.selectFirst(this.chapterNameSelector)?.text() : null) ?? link.text();
    const date =
      element.selectFirst('img:not(.thumb)')?.attr('alt') ||
      element.selectFirst('span a')?.attr('title') ||
      element.selectFirst(this.chapterDateSelector)?.text();
    return { url: pathOf(href), name, uploadedAt: this.parseChapterDate(date) };
  }

  parseChapterDate(date: string | null | undefined): number | undefined {
    if (!date) return undefined;
    const value = date.trim();
    const lower = value.toLowerCase();
    const today = new Date();
    const startOfDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    if (['today', 'hoje', 'hoy', 'hari ini'].some((w) => lower.startsWith(w))) return startOfDay;
    if (['yesterday', 'ontem', 'ayer', 'kemarin'].some((w) => lower.startsWith(w))) return startOfDay - 86_400_000;
    if (/\d/.test(lower) && /ago|lalu|yang|hace|atrás|il y a/.test(lower)) {
      const relative = parseRelativeDate(value);
      if (relative !== undefined) return relative;
    }
    return parseDate(value, this.chapterDatePattern) ?? parseRelativeDate(value);
  }

  // Pages
  async getPages(chapter: Chapter): Promise<Page[]> {
    const url = this.absolute(chapter.url);
    let document = await this.fetchDocument(url);
    if (document.selectFirst('#single-pager')) {
      document = await this.fetchDocument(`${url}${url.includes('?') ? '&' : '?'}style=list`);
    }
    return this.parsePages(document);
  }

  parsePages(document: HtmlElement): Page[] {
    const protector = document.selectFirst('#chapter-protector-data');
    if (!protector) {
      return (
        document
          .select(this.pageListParseSelector)
          // Jsoup's selectFirst also matches the element itself (selectors ending in "img").
          .map((element) => this.imageFromElement(element.selectFirst('img') ?? element))
          .filter((url): url is string => Boolean(url))
          .map((imageUrl, index) => ({ index, imageUrl }))
      );
    }
    const src = protector.attr('src') ?? '';
    const script = src.startsWith('data:text/javascript;base64,')
      ? base64.decode(src.slice(src.indexOf(',') + 1))
      : protector.html();
    const password = between(script, "wpmangaprotectornonce='", "';");
    const encrypted = between(script, "chapter_data='", "';").replace(/\\\//g, '/');
    const data = JSON.parse(encrypted) as { ct: string; s: string };
    const raw = decryptChapterData(data.ct, data.s, password);
    const images = JSON.parse(JSON.parse(raw) as string) as string[];
    return images.map((imageUrl, index) => ({ index, imageUrl }));
  }

  imageFromElement(element: HtmlElement | null | undefined): string | null {
    if (!element) return null;
    for (const name of ['data-src', 'data-lazy-src', 'data-lzl-src', 'data-cfsrc', 'data-manga-src']) {
      // Some sites glue the CDN prefix in front of an absolute url ("https://cdn/ https://cdn/x.jpg").
      const value = element
        .attr(name)
        ?.trim()
        .split(/\s+(?=https?:\/\/)/)
        .pop();
      // Absolute values are used as they are: some sites pad them with spaces, which absUrl would mangle.
      if (value != null) return /^https?:\/\//.test(value) ? value : (element.absUrl(name) || value).trim();
    }
    const srcset = element.attr('srcset');
    if (srcset) return srcSetImage(srcset);
    const src = element.attr('src')?.trim();
    if (!src) return null;
    return /^https?:\/\//.test(src) ? src : (element.absUrl('src') || src).trim();
  }

  processThumbnail(url: string | null, _fromSearch = false): string | null {
    return url;
  }

  imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  // URLs
  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)([^?#]*)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    const segments = (match[2] ?? '').split('/').filter(Boolean);
    if (segments.length < 2) return null;
    // Keep the site's own form (with or without the trailing slash) so it matches listed urls.
    const slash = new RegExp(`^/${segments[0]}/${segments[1]}/`).test(match[2] ?? '') ? '/' : '';
    return { url: `/${segments[0]}/${segments[1]}${slash}`, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return this.absolute(item.url);
  }

  // Helpers
  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  xhrHeaders(): Record<string, string> {
    return { ...this.headers(), 'X-Requested-With': 'XMLHttpRequest' };
  }

  async fetchDocument(url: string): Promise<HtmlElement> {
    const response = await http.get(url, { headers: this.headers() });
    return html.load(response.body, { baseUrl: response.url });
  }

  /** The manga page and its path after redirects (sites move series between directories). */
  async fetchMangaPage(manga: MangaSummary): Promise<{ document: HtmlElement; path: string }> {
    const response = await http.get(this.absolute(manga.url), { headers: this.headers() });
    // Single-series sites redirect the series page to the home page: keep the stored url then.
    const path = pathOf(response.url);
    return {
      document: html.load(response.body, { baseUrl: response.url }),
      path: path.split('/').filter(Boolean).length >= 2 ? path : manga.url,
    };
  }

  absolute(url: string): string {
    if (/^https?:\/\//.test(url)) return url;
    if (url.startsWith('//')) return `https:${url}`;
    return `${this.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
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

/** Path of an absolute or relative url, without query and fragment. */
export function pathOf(url: string): string {
  const path = url
    .trim()
    .replace(/^(?:https?:)?\/\/[^/?#]+/i, '')
    .replace(/[?#].*$/, '');
  return path.startsWith('/') ? path : `/${path}`;
}

/** Post id of a manga page. */
export function mangaIdOf(document: HtmlElement): string | null {
  return (
    document.selectFirst('[id^=manga-chapters-holder]')?.attr('data-id') ||
    document.selectFirst('input.rating-post-id')?.attr('value') ||
    document.selectFirst('a[data-post]')?.attr('data-post') ||
    /[?&]p=(\d+)/.exec(document.selectFirst('link[rel=shortlink]')?.attr('href') ?? '')?.[1] ||
    null
  );
}

function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  if (from < 0) return '';
  const rest = text.slice(from + start.length);
  const to = rest.indexOf(end);
  return to < 0 ? rest : rest.slice(0, to);
}

/** CryptoJS-style AES (OpenSSL EVP_BytesToKey with MD5) used by the "WP Manga Chapter Protector". */
export function decryptChapterData(ciphertext: string, saltHex: string, password: string): string {
  const salt = (saltHex.match(/../g) ?? []).map((h) => Number.parseInt(h, 16));
  const pass = utf8.encode(password);
  let keyAndIv: number[] = [];
  let previous: number[] = [];
  while (keyAndIv.length < 48) {
    previous = md5Bytes([...previous, ...pass, ...salt]);
    keyAndIv = keyAndIv.concat(previous);
  }
  const bytes = crypto.aesDecrypt(base64.decodeBytes(ciphertext), keyAndIv.slice(0, 32), {
    mode: 'cbc',
    iv: keyAndIv.slice(32, 48),
  });
  return utf8.decode([...bytes]);
}

function srcSetImage(srcset: string): string | null {
  const images = srcset
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/, 2))
    .filter((candidate) => /^https?:\/\/\S+$/.test(candidate[0] ?? ''));
  let best: string | null = null;
  let bestSize = -1;
  for (const [url, descriptor] of images) {
    const size = Number.parseFloat(/^(\d+(?:\.\d+)?)[wx]$/.exec(descriptor ?? '')?.[1] ?? '');
    if (!Number.isNaN(size) && size > bestSize) {
      best = url!;
      bestSize = size;
    }
  }
  return best ?? images[images.length - 1]?.[0] ?? null;
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

/** select() where `:contains(x)` matches case-insensitively, as in Jsoup. */
export function selectIgnoreCase(root: HtmlElement, selector: string): HtmlElement[] {
  if (!selector.includes(':contains(')) return root.select(selector);
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
  return root.select([...variants].join(', '));
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
 * yyyy, H/HH, mm). Epoch ms in UTC, or undefined.
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
    } else if (letter === 'E') regex += '[^\\s\\d.,]+';
    else if (letter === 'a') {
      regex += '([ap]\\.?m\\.?)';
      fields.push('ampm');
    } else if ('dMyHhms'.includes(letter ?? '')) {
      regex += '(\\d{1,4})';
      fields.push(letter ?? '');
    } else regex += escapeRegex(token).replace(/\s+/g, '\\s*');
  }
  const match = new RegExp(regex, 'i').exec(text.trim());
  if (!match) return undefined;
  let year = new Date().getUTCFullYear();
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
  if (pm && hour < 12) hour += 12;
  if (pm === false && hour === 12) hour = 0;
  const time = Date.UTC(year, month, day, hour, minute, second);
  return Number.isNaN(time) ? undefined : time;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
