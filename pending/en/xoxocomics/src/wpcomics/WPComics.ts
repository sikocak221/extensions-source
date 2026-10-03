// WPComics, ported from keiyoushi/extensions-source lib-multisrc/wpcomics. This directory is a template:
// every extension using the theme keeps an identical copy in src/wpcomics/ (`node scripts/sync-multisrc.mjs`).
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
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl, withQuery } from './utils';

export abstract class WPComics {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;
  /** Java pattern of chapter dates, and the UTC offset in minutes they are written in (null: in the text). */
  datePattern = 'HH:mm - dd/MM/yyyy';
  gmtOffsetMinutes: number | null = 300;
  popularPath = 'hot';
  searchPath = 'tim-truyen';
  queryParam = 'keyword';
  genresSelector = '.genres ul.nav li:not(.active) a';
  genresUrlDelimiter = '/';
  pageListSelector = 'div.page-chapter > img, li.blocks-gallery-item img';
  labels = {
    status: 'Status',
    genre: 'Genre',
    all: 'All',
    ongoing: 'Ongoing',
    completed: 'Completed',
    otherName: 'Other name',
  };

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  async fetchDocument(url: string): Promise<HtmlElement> {
    const response = await http.get(url, { headers: this.headers() });
    return html.load(response.body, { baseUrl: response.url });
  }

  imageOrNull(element: HtmlElement | null | undefined): string | undefined {
    if (!element) return undefined;
    for (const name of ['data-original', 'data-src', 'src']) {
      const value = element.attr(name)?.trim();
      const absolute = value ? element.absUrl(name) || value : '';
      if (/^https?:\/\//i.test(absolute)) return absolute;
    }
    return undefined;
  }

  popularMangaSelector(): string {
    return 'div.items div.item';
  }

  popularMangaNextPageSelector(): string {
    return 'a.next-page, a[rel=next]';
  }

  mangaFromElement(element: HtmlElement, imageSelector = 'div.image:first-of-type img'): MangaSummary {
    const link = element.selectFirst('h3 a');
    return {
      url: relativeUrl(link?.absUrl('href') || link?.attr('href') || ''),
      title: link?.text() ?? '',
      thumbnailUrl: this.imageOrNull(element.selectFirst(imageSelector)),
    };
  }

  parseList(document: HtmlElement, selector: string, imageSelector?: string): MangaPage {
    const items = document
      .select(selector)
      .map((e) => this.mangaFromElement(e, imageSelector))
      .filter((m) => m.url && m.title);
    return { items, hasNextPage: document.selectFirst(this.popularMangaNextPageSelector()) != null };
  }

  async getPopular(page: number): Promise<MangaPage> {
    return this.parseList(
      await this.fetchDocument(`${this.baseUrl}/${this.popularPath}${page > 1 ? `?page=${page}` : ''}`),
      this.popularMangaSelector(),
    );
  }

  latestUpdatesSelector(): string {
    return this.popularMangaSelector();
  }

  async getLatest(page: number): Promise<MangaPage> {
    return this.parseList(
      await this.fetchDocument(`${this.baseUrl}${page > 1 ? `?page=${page}` : ''}`),
      this.latestUpdatesSelector(),
    );
  }

  searchUrl(query: string, page: number, filters: FilterState): string {
    const genre = typeof filters.genre === 'string' && filters.genre ? `/${filters.genre}` : '';
    return withQuery(`${this.baseUrl}/${this.searchPath}${genre}`, {
      status: typeof filters.status === 'string' && filters.status ? filters.status : undefined,
      [this.queryParam]: query.trim(),
      page: String(page),
      sort: '0',
    });
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    return this.parseList(
      await this.fetchDocument(this.searchUrl(query, page, filters)),
      'div.items div.item',
      'div.image a img',
    );
  }

  // Details
  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    return this.mangaDetailsParse(await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url)), manga);
  }

  mangaDetailsParse(document: HtmlElement, manga: MangaSummary): MangaDetails {
    const info = document.selectFirst('article#item-detail');
    if (!info) return { url: manga.url, title: manga.title, status: 'unknown' };
    const otherName = info
      .select('h2.other-name')
      .map((e) => e.text())
      .join(' ');
    const description = info
      .select('div.detail-content p')
      .map((p) => p.text().trim())
      .join('\n');
    return {
      url: manga.url,
      title: info.selectFirst('h1')?.text() || manga.title,
      author:
        info
          .select('li.author p.col-xs-8')
          .map((e) => e.text())
          .join(' ') || undefined,
      status: this.toStatus(
        info
          .select('li.status p.col-xs-8')
          .map((e) => e.text())
          .join(' '),
      ),
      genres: info.select('li.kind p.col-xs-8 a').map((a) => a.text()),
      thumbnailUrl: this.imageOrNull(info.selectFirst('div.col-image img')) ?? manga.thumbnailUrl,
      description: `${description}${otherName ? `\n\n${this.labels.otherName}: ${otherName}` : ''}`.trim() || undefined,
    };
  }

  toStatus(text: string): MangaStatus {
    const has = (words: string[]) => words.some((w) => text.toLowerCase().includes(w.toLowerCase()));
    if (has(['Ongoing', 'Updating', 'Đang tiến hành', 'Đang cập nhật', 'Đang thực hiện', 'Đang ra', '連載中']))
      return 'ongoing';
    if (has(['Complete', 'Hoàn thành', 'Đã hoàn thành', 'Full', '完結済み'])) return 'completed';
    if (has(['Tạm Ngưng', 'Tạm Hoãn'])) return 'hiatus';
    return 'unknown';
  }

  // Chapters
  chapterListSelector(): string {
    return 'div.list-chapter li.row:not(.heading)';
  }

  chapterDateSelector = 'div.col-xs-4';

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url));
    return this.chapterListParse(document);
  }

  chapterListParse(document: HtmlElement): Chapter[] {
    return document.select(this.chapterListSelector()).flatMap((element): Chapter[] => {
      const link = element.selectFirst('a');
      if (!link) return [];
      return [
        {
          url: relativeUrl(link.attr('href') ?? ''),
          name: link.text(),
          uploadedAt: this.toDate(element.selectFirst(this.chapterDateSelector)?.text()),
        },
      ];
    });
  }

  toDate(text: string | undefined): number | undefined {
    if (!text) return undefined;
    const value = text.toLowerCase();
    const has = (words: string[]) => words.some((w) => value.includes(w));
    if (has(['ago', 'trước', '前'])) {
      const amount = Number.parseInt(/(\d+)/.exec(value)?.[1] ?? '', 10);
      if (Number.isNaN(amount)) return undefined;
      const date = new Date();
      if (has(['year', 'năm'])) date.setFullYear(date.getFullYear() - amount);
      else if (has(['month', 'tháng', '月'])) date.setMonth(date.getMonth() - amount);
      else if (has(['day', 'ngày', '日'])) date.setDate(date.getDate() - amount);
      else if (has(['week', 'tuần', '週間'])) date.setDate(date.getDate() - amount * 7);
      else if (has(['hour', 'giờ', '時間'])) date.setHours(date.getHours() - amount);
      else if (has(['minute', 'phút', '分'])) date.setMinutes(date.getMinutes() - amount);
      else if (has(['second', 'giây'])) date.setSeconds(date.getSeconds() - amount);
      return date.getTime();
    }
    let dateText = text.trim();
    // Some sites leave out the year (the current one).
    if (!/\d+[-/.]\d+[-/.]\d\d/.test(dateText)) {
      const delimiter = dateText.includes('-') ? '-' : dateText.includes('.') ? '.' : '/';
      dateText = `${dateText}${delimiter}${new Date().getFullYear() % 100}`;
    }
    const time = parseDate(dateText, this.datePattern) ?? parseDate(dateText, this.datePattern.replace('yyyy', 'yy'));
    if (time === undefined) return undefined;
    return this.gmtOffsetMinutes == null ? time : time - this.gmtOffsetMinutes * 60_000;
  }

  // Pages
  async getPages(chapter: Chapter): Promise<Page[]> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, chapter.url));
    return this.pageListParse(document);
  }

  pageListParse(document: HtmlElement): Page[] {
    const urls = document
      .select(this.pageListSelector)
      .map((img) => this.imageOrNull(img))
      .filter((u): u is string => Boolean(u));
    return [...new Set(urls)].map((imageUrl, index) => ({ index, imageUrl }));
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  // Filters
  statusOptions(): FilterOption[] {
    return [
      { label: this.labels.all, value: '' },
      { label: this.labels.ongoing, value: '1' },
      { label: this.labels.completed, value: '2' },
    ];
  }

  genresUrl(): string {
    return `${this.baseUrl}/${this.searchPath}`;
  }

  async getFilters(): Promise<Filter[]> {
    const filters: Filter[] = [
      { type: 'select', id: 'status', label: this.labels.status, options: this.statusOptions() },
    ];
    try {
      const document = await this.fetchDocument(this.genresUrl());
      const genres = document
        .select(this.genresSelector)
        .map((a) => ({
          label: a.text(),
          value: (a.attr('href') ?? '').replace(/\/+$/, '').split(this.genresUrlDelimiter).pop() ?? '',
        }))
        .filter((g) => g.value);
      if (genres.length > 0)
        filters.push({
          type: 'select',
          id: 'genre',
          label: this.labels.genre,
          options: [{ label: this.labels.all, value: '' }, ...genres],
        });
    } catch (error) {
      log.warn('Cannot load genres', error);
    }
    return filters;
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)(\/[^?#]+)/i.exec(url.trim());
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
