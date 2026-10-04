// MultiChan, ported from keiyoushi/extensions-source lib-multisrc/multichan. This directory is a template: every
// extension using the theme keeps an identical copy in src/multichan/ (`node scripts/sync-multisrc.mjs`).
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
import { USER_AGENT, absoluteUrl, decodeEntities, hostOf, parseDate, relativeUrl, selectIgnoreCase } from './utils';

const CHAPTER_NUMBER_REGEX = /(глава\s|часть\s)([0-9]+\.?[0-9]*)/i;

export abstract class MultiChan {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  async fetchDocument(url: string, extra: Record<string, string> = {}): Promise<HtmlElement> {
    const response = await http.get(url, { headers: { ...this.headers(), ...extra } });
    return html.load(response.body, { baseUrl: response.url });
  }

  popularMangaSelector(): string {
    return 'div.content_row';
  }

  latestUpdatesSelector(): string {
    return this.popularMangaSelector();
  }

  searchMangaSelector(): string {
    return this.popularMangaSelector();
  }

  popularMangaNextPageSelector(): string {
    return 'a:contains(Вперед)';
  }

  latestUpdatesNextPageSelector(): string {
    return this.popularMangaNextPageSelector();
  }

  searchMangaNextPageSelector(): string {
    return 'a:contains(Далее)';
  }

  /** Lets a site drop result rows that are not manga (Jsoup's `:containsOwn` has no CSS equivalent). */
  isSearchResult(_element: HtmlElement): boolean {
    return true;
  }

  popularMangaFromElement(element: HtmlElement): MangaSummary {
    const link = element.selectFirst('h2 > a');
    return {
      url: relativeUrl(link?.absUrl('href') || link?.attr('href') || ''),
      title: element.attr('title') ?? '',
      thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined,
    };
  }

  latestUpdatesFromElement(element: HtmlElement): MangaSummary {
    return this.popularMangaFromElement(element);
  }

  searchMangaFromElement(element: HtmlElement): MangaSummary {
    return this.popularMangaFromElement(element);
  }

  popularUrl(page: number): string {
    return `${this.baseUrl}/mostfavorites?offset=${20 * (page - 1)}`;
  }

  latestUpdatesUrl(page: number): string {
    return `${this.baseUrl}/manga/new?offset=${20 * (page - 1)}`;
  }

  abstract searchMangaUrl(page: number, query: string, filters: FilterState): string;

  async getPopular(page: number): Promise<MangaPage> {
    const document = await this.fetchDocument(this.popularUrl(page));
    return {
      items: selectIgnoreCase(document, this.popularMangaSelector()).map((e) => this.popularMangaFromElement(e)),
      hasNextPage: selectIgnoreCase(document, this.popularMangaNextPageSelector()).length > 0,
    };
  }

  async getLatest(page: number): Promise<MangaPage> {
    const document = await this.fetchDocument(this.latestUpdatesUrl(page));
    return {
      items: selectIgnoreCase(document, this.latestUpdatesSelector()).map((e) => this.latestUpdatesFromElement(e)),
      hasNextPage: selectIgnoreCase(document, this.latestUpdatesNextPageSelector()).length > 0,
    };
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const document = await this.fetchDocument(this.searchMangaUrl(page, query.trim(), filters));
    return {
      items: selectIgnoreCase(document, this.searchMangaSelector())
        .filter((e) => this.isSearchResult(e))
        .map((e) => this.searchMangaFromElement(e)),
      // A "next" link of the search results, or of the tag listing.
      hasNextPage:
        selectIgnoreCase(document, this.searchMangaNextPageSelector()).length > 0 ||
        selectIgnoreCase(document, this.popularMangaNextPageSelector()).length > 0,
    };
  }

  abstract getFilters(): Filter[];

  parseStatus(text: string): MangaStatus {
    if (text.includes('перевод завершен')) return 'completed';
    if (text.includes('перевод продолжается')) return 'ongoing';
    return 'unknown';
  }

  mangaDetailsParse(document: HtmlElement, manga: MangaSummary): MangaDetails {
    const row = (label: string) => selectIgnoreCase(document, `#info_wrap tr:contains(${label})`)[0] ?? null;
    const category = (
      row('Тип')
        ?.select('a')
        .map((a) => a.text())
        .join(' ') ?? ''
    ).toLowerCase();
    const tags = document.select('.sidetags ul a:last-child').map((a) => a.text());
    const description = document.selectFirst('div#description')?.html() ?? '';
    return {
      url: manga.url,
      title: (document.selectFirst('title')?.text() ?? manga.title).split(' »')[0]!,
      author: row('Автор')?.selectFirst('.item2')?.text() || undefined,
      genres: [category, ...tags].filter(Boolean),
      status: this.parseStatus(row('Загружено')?.text() ?? ''),
      // The first text node of the description.
      description: decodeEntities(description.split('<')[0]!).trim() || undefined,
      thumbnailUrl: document.selectFirst('img#cover')?.absUrl('src') || manga.thumbnailUrl,
    };
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    return this.mangaDetailsParse(await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url)), manga);
  }

  chapterListSelector(): string {
    return 'table.table_cha tr:gt(1)';
  }

  chapterFromElement(element: HtmlElement): Chapter {
    const link = element.selectFirst('a');
    const name = link?.text() ?? '';
    const number = CHAPTER_NUMBER_REGEX.exec(name)?.[2];
    return {
      url: relativeUrl(link?.absUrl('href') || link?.attr('href') || ''),
      name,
      number: number ? Number.parseFloat(number) : undefined,
      uploadedAt: parseDate(element.selectFirst('div.date')?.text(), 'yyyy-MM-dd'),
    };
  }

  async fetchChapterList(_manga: MangaSummary, mangaPage: HtmlElement): Promise<Chapter[]> {
    return mangaPage
      .select(this.chapterListSelector())
      .map((e) => this.chapterFromElement(e))
      .filter((c) => c.url && c.name);
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    return this.fetchChapterList(manga, await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url)));
  }

  pageListParse(body: string): Page[] {
    const begin = body.indexOf('fullimg":[') + 10;
    const end = body.indexOf(',]', begin);
    return body
      .slice(begin, end)
      .replace(/"/g, '')
      .split(',')
      .map((imageUrl, index) => ({ index, imageUrl }));
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const response = await http.get(absoluteUrl(this.baseUrl, chapter.url), { headers: this.headers() });
    return this.pageListParse(response.body);
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)(\/manga\/[^?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: match[2]!, title: '' };
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
