// MangaWork (Tailwind WordPress sites), ported from keiyoushi/extensions-source lib-multisrc/mangawork. This
// directory is a template: every extension using the theme keeps an identical copy in src/mangawork/
// (`node scripts/sync-multisrc.mjs`).
//
// Manga urls are paths ("/manga/<slug>/"); chapters come from the manga page plus "load_chapters" ajax pages.
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
  Source,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, ownText, parseDate, relativeUrl } from './utils';

/** [label, value] */
export type Option = [string, string];

type BrowseMode = 'popular' | 'latest' | 'search';

export abstract class MangaWork {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;
  chapterDatePattern = 'd/M/yyyy';

  seriesPath = 'series';
  mangaPath = 'manga';
  adminAjaxPath = 'wp-admin/admin-ajax.php';

  searchQueryParam = 'title';
  orderQueryParam = 'order';
  statusQueryParam = 'status';
  typeQueryParam = 'type';
  genreQueryParam = 'genre[]';
  yearQueryParam = 'years[]';

  popularOrderValue = 'popular';
  latestOrderValue = 'update';
  searchOrderValue = 'title';
  chapterAjaxAction = 'load_chapters';
  defaultChapterOrder = 'DESC';
  defaultChapterCount = '1000';

  get mangaEntrySelector(): string {
    return `div.w-full.h-full:has(a[href*='/${this.mangaPath}/'])`;
  }
  get mangaEntryAnchorSelector(): string {
    return `a[href*='/${this.mangaPath}/']`;
  }
  mangaEntryTitleSelector = 'h1';
  mangaEntryThumbnailSelector = 'img';
  listNextPageSelector = '.pagination .page-numbers.current + a[href]';

  detailsTitleSelector = 'h1.text-4xl.font-bold.mb-2';
  detailsThumbnailSelector = 'img[itemprop=image], [itemprop=image] img';
  detailsGenreSelector = '[itemprop=genre]';
  detailsDescriptionSelector = 'div.text-base.leading-relaxed.mb-6.text-muted-foreground';
  detailsInfoItemSelector = 'div.grid.grid-cols-2.gap-4.text-sm.text-gray-600.mb-6 > div';
  detailsInfoLabelSelector = 'strong';
  detailsInfoValueSelector = 'p';
  detailsAuthorLabel = 'Autor(es)';

  chapterContainerSelector = '#chapter_list.chapter_list_container';
  chapterEntrySelector = 'li';
  chapterLinkSelector = 'a[href]';
  chapterNameSelector = 'span.m-0, span.line-clamp-1';
  chapterNextPageSelector = 'button.load-chapters[data-paged]';
  chapterNumberRegex = /(\d+(?:[.,]\d+)?)/;

  pageImageSelector = 'div.reader-area img#imagech, div.reader-area img[src*="/manga_auto_capitulos/"]';
  pageImageRegex = /"image"\s*:\s*"([^"]+)"/g;

  orderFilterTitle = 'Sort by';
  statusFilterTitle = 'Status';
  typeFilterTitle = 'Type';
  genreFilterTitle = 'Genre';
  yearFilterTitle = 'Years';

  getOrderFilterOptions(): Option[] {
    return [];
  }
  getStatusFilterOptions(): Option[] {
    return [];
  }
  getTypeFilterOptions(): Option[] {
    return [];
  }
  getGenreFilterOptions(): Option[] {
    return [];
  }
  getYearFilterOptions(): Option[] {
    return [];
  }

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  async fetchDocument(url: string): Promise<HtmlElement> {
    const response = await http.get(url, { headers: this.headers() });
    return html.load(response.body, { baseUrl: response.url });
  }

  // Browse
  getPopular(page: number): Promise<MangaPage> {
    return this.seriesList(page, 'popular');
  }

  getLatest(page: number): Promise<MangaPage> {
    return this.seriesList(page, 'latest');
  }

  search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    return this.seriesList(page, 'search', query, filters);
  }

  async seriesList(page: number, mode: BrowseMode, query = '', filters: FilterState = {}): Promise<MangaPage> {
    const params: [string, string][] = [];
    const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');
    const defaultOrder =
      mode === 'popular' ? this.popularOrderValue : mode === 'latest' ? this.latestOrderValue : this.searchOrderValue;
    params.push([this.searchQueryParam, query.trim()]);
    params.push([this.orderQueryParam, text('order') || defaultOrder]);
    params.push([this.statusQueryParam, text('status')]);
    params.push([this.typeQueryParam, text('type')]);
    for (const [id, value] of Object.entries(filters)) {
      if (value !== true) continue;
      if (id.startsWith('genre.')) params.push([this.genreQueryParam, id.slice('genre.'.length)]);
      else if (id.startsWith('year.')) params.push([this.yearQueryParam, id.slice('year.'.length)]);
    }
    const url = `${this.buildSeriesUrl(page)}?${params
      .map(([k, v]) => `${encodeURIComponent(k).replace(/%5B/g, '[').replace(/%5D/g, ']')}=${encodeURIComponent(v)}`)
      .join('&')}`;
    const document = await this.fetchDocument(url);
    const items = this.parseMangaList(document);
    return { items, hasNextPage: document.selectFirst(this.listNextPageSelector) != null };
  }

  buildSeriesUrl(page: number): string {
    const base = `${this.baseUrl.replace(/\/+$/, '')}/${this.seriesPath.replace(/^\/+|\/+$/g, '')}/`;
    return page > 1 ? `${base}page/${page}/` : base;
  }

  parseMangaList(document: HtmlElement): MangaSummary[] {
    const items: MangaSummary[] = [];
    for (const element of document.select(this.mangaEntrySelector)) {
      const anchor = element.selectFirst(this.mangaEntryAnchorSelector);
      if (!anchor) continue;
      const title = anchor.attr('title')?.trim() || element.selectFirst(this.mangaEntryTitleSelector)?.text() || '';
      if (!title) continue;
      items.push({
        url: relativeUrl(anchor.absUrl('href') || anchor.attr('href') || ''),
        title,
        thumbnailUrl: this.toImageUrl(anchor.selectFirst(this.mangaEntryThumbnailSelector)) || undefined,
      });
    }
    return items;
  }

  // Filters
  getFilters(): Filter[] {
    const filters: Filter[] = [];
    const select = (id: string, label: string, options: Option[], def?: string) => {
      if (options.length === 0) return;
      filters.push({
        type: 'select',
        id,
        label,
        options: options.map(([l, value]) => ({ label: l, value })),
        ...(def && options.some(([, v]) => v === def) ? { default: def } : {}),
      });
    };
    const group = (id: string, label: string, options: Option[]) => {
      if (options.length === 0) return;
      filters.push({
        type: 'group',
        id,
        label,
        filters: options.map(([l, value]) => ({ type: 'checkbox' as const, id: `${id}.${value}`, label: l })),
      });
    };
    select('order', this.orderFilterTitle, this.getOrderFilterOptions(), this.searchOrderValue);
    select('status', this.statusFilterTitle, this.getStatusFilterOptions());
    select('type', this.typeFilterTitle, this.getTypeFilterOptions());
    group('genre', this.genreFilterTitle, this.getGenreFilterOptions());
    group('year', this.yearFilterTitle, this.getYearFilterOptions());
    return filters;
  }

  // Details
  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    return this.parseMangaDetails(await this.fetchDocument(this.absolute(manga.url)), manga);
  }

  parseMangaDetails(document: HtmlElement, manga: MangaSummary): MangaDetails {
    const genres = document.select(this.detailsGenreSelector).map((g) => g.text());
    return {
      url: manga.url,
      title: document.selectFirst(this.detailsTitleSelector)?.text() || manga.title,
      thumbnailUrl: this.toImageUrl(document.selectFirst(this.detailsThumbnailSelector)) || manga.thumbnailUrl,
      author: this.findInfoValue(document, this.detailsAuthorLabel),
      genres: genres.length > 0 ? genres : undefined,
      description: document.selectFirst(this.detailsDescriptionSelector)?.text() || undefined,
      status: this.parseStatus(this.statusText(document)),
    };
  }

  /** The element in front of the first genre carries the status; fall back to a "Status" info item. */
  statusText(document: HtmlElement): string | undefined {
    const genre = document.selectFirst(this.detailsGenreSelector);
    if (genre) {
      const before = /([^<>]+)<\/[^>]+>\s*(?:<[^>]+>\s*)*$/.exec(
        document.html().split(genre.html().slice(0, 60))[0] ?? '',
      );
      if (before?.[1]?.trim()) return before[1].trim();
    }
    return this.findInfoValue(document, 'Status') ?? this.findInfoValue(document, 'Situação');
  }

  findInfoValue(document: HtmlElement, label: string): string | undefined {
    for (const item of document.select(this.detailsInfoItemSelector)) {
      if (item.selectFirst(this.detailsInfoLabelSelector)?.text() !== label) continue;
      const value = item.selectFirst(this.detailsInfoValueSelector)?.text();
      if (value) return value;
    }
    return undefined;
  }

  parseStatus(status: string | undefined): MangaStatus {
    switch (status?.trim().toLowerCase()) {
      case 'publishing':
      case 'ongoing':
      case 'em andamento':
        return 'ongoing';
      case 'finished':
      case 'completed':
      case 'concluído':
      case 'concluido':
      case 'finalizado':
        return 'completed';
      case 'on hold':
      case 'on-hold':
      case 'hiatus':
      case 'em hiato':
        return 'hiatus';
      case 'cancelled':
      case 'canceled':
      case 'cancelado':
        return 'cancelled';
      default:
        return 'unknown';
    }
  }

  // Chapters
  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const mangaUrl = this.absolute(manga.url);
    return this.chapterListParse(await this.fetchDocument(mangaUrl), mangaUrl);
  }

  async chapterListParse(document: HtmlElement, referer: string): Promise<Chapter[]> {
    const container = document.selectFirst(this.chapterContainerSelector);
    const chapters = this.chapterElements(document).map((e) => this.chapterFromElement(e));
    if (!container) return chapters;
    const postId = container.attr('data-post-id');
    if (!postId) return chapters;
    const count = container.attr('data-count') || this.defaultChapterCount;
    const requested = new Set<string>();
    let currentPage = 1;
    let next = this.findNextChapterPageButton(document, currentPage);
    while (next) {
      const page = next.attr('data-paged');
      if (!page || requested.has(page)) break;
      requested.add(page);
      const order = next.attr('data-order') || this.defaultChapterOrder;
      const pageDocument = await this.fetchChapterListPage(referer, postId, count, page, order);
      chapters.push(...this.chapterElements(pageDocument).map((e) => this.chapterFromElement(e)));
      currentPage = Number.parseInt(page, 10) || currentPage;
      next = this.findNextChapterPageButton(pageDocument, currentPage);
    }
    const seen = new Set<string>();
    return chapters.filter((c) => !seen.has(c.url) && seen.add(c.url));
  }

  chapterElements(document: HtmlElement): HtmlElement[] {
    return document.selectFirst(this.chapterContainerSelector)?.select(this.chapterEntrySelector) ?? [];
  }

  findNextChapterPageButton(document: HtmlElement, currentPage: number): HtmlElement | null {
    for (const button of document.select(this.chapterNextPageSelector)) {
      const page = Number.parseInt(button.attr('data-paged') ?? '', 10);
      if (!Number.isNaN(page) && page > currentPage) return button;
    }
    return null;
  }

  chapterFromElement(element: HtmlElement): Chapter {
    const anchor = element.selectFirst(this.chapterLinkSelector);
    const nameElement = element.selectFirst(this.chapterNameSelector);
    const name =
      (nameElement ? ownText(nameElement) || nameElement.text() : '') ||
      (anchor ? ownText(anchor) || anchor.text() : '');
    const number = this.chapterNumberRegex.exec(name)?.[1]?.replace(',', '.');
    const spans = element.select('span');
    return {
      url: relativeUrl(anchor?.absUrl('href') || anchor?.attr('href') || ''),
      name,
      number: number ? Number.parseFloat(number) : undefined,
      uploadedAt: this.parseChapterDate(spans[spans.length - 1]?.text() || undefined),
    };
  }

  async fetchChapterListPage(
    referer: string,
    postId: string,
    count: string,
    page: string,
    order: string,
  ): Promise<HtmlElement> {
    const response = await http.post(
      this.buildAdminAjaxUrl(),
      { form: { action: this.chapterAjaxAction, post_id: postId, count, paged: page, order } },
      { headers: { ...this.headers(), Referer: referer, Accept: '*/*' } },
    );
    return html.load(response.body, { baseUrl: this.baseUrl });
  }

  buildAdminAjaxUrl(): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/${this.adminAjaxPath.replace(/^\/+/, '')}`;
  }

  parseChapterDate(date: string | undefined): number | undefined {
    return parseDate(date, this.chapterDatePattern);
  }

  // Pages
  async getPages(chapter: Chapter): Promise<Page[]> {
    const response = await http.get(this.absolute(chapter.url), { headers: this.headers() });
    const document = html.load(response.body, { baseUrl: response.url });
    const urls = document
      .select(this.pageImageSelector)
      .map((e) => this.toImageUrl(e))
      .filter((u): u is string => !!u);
    if (urls.length === 0) {
      for (const match of response.body.matchAll(this.pageImageRegex)) urls.push(match[1]!.replace(/\\\//g, '/'));
    }
    return urls.map((imageUrl, index) => ({ index, imageUrl }));
  }

  toImageUrl(element: HtmlElement | null | undefined): string | null {
    if (!element) return null;
    for (const name of ['src', 'data-src', 'data-lazy-src']) {
      const value = element.absUrl(name);
      if (value) return value;
    }
    return null;
  }

  // URLs
  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  absolute(url: string): string {
    return absoluteUrl(this.baseUrl, url);
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/([^/?#]+)\/([^/?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl) || match[2] !== this.mangaPath) return null;
    return { url: `/${this.mangaPath}/${match[3]}/`, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return this.absolute(item.url);
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
