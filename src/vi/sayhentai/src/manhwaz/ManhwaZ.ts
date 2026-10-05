// ManhwaZ, ported from keiyoushi/extensions-source lib-multisrc/manhwaz. This directory is a template: every
// extension using the theme keeps an identical copy in src/manhwaz/ (`node scripts/sync-multisrc.mjs`).
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
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl, selectIgnoreCase } from './utils';

const STRINGS = {
  en: {
    genre_filter_title: 'Genre',
    genre_all: 'All',
    genre_completed: 'Completed',
    order_by_filter_title: 'Order by',
    order_by_latest: 'Latest',
    order_by_rating: 'Rating',
    order_by_most_views: 'Most views',
    order_by_new: 'New',
    filter_ignored_warning: 'Ignored when using text search',
    cannot_use_order_by_warning: 'Cannot use "Order by" filter when genre is "%s" or "%s"',
  },
  vi: {
    genre_filter_title: 'Thể loại',
    genre_all: 'Tất cả',
    genre_completed: 'Hoàn thành',
    order_by_filter_title: 'Sắp xếp theo',
    order_by_latest: 'Mới nhất',
    order_by_rating: 'Đánh giá cao',
    order_by_most_views: 'Xem nhiều',
    order_by_new: 'Mới',
    filter_ignored_warning: 'Không thể dùng chung với tìm kiếm bằng từ khoá',
    cannot_use_order_by_warning: 'Không thể sắp xếp nếu chọn thể loại là "%s" hoặc "%s"',
  },
} as const;

const UNITS: [string[], number][] = [
  [['second', 'seconds', 'giây'], 1000],
  [['minute', 'minutes', 'phút'], 60_000],
  [['hour', 'hours', 'giờ'], 3_600_000],
  [['day', 'days', 'ngày'], 86_400_000],
  [['week', 'weeks', 'tuần'], 7 * 86_400_000],
  [['month', 'months', 'tháng'], 30 * 86_400_000],
  [['year', 'years', 'năm'], 365 * 86_400_000],
];

export interface SelectOption {
  name: string;
  id: string;
}

export abstract class ManhwaZ {
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  /** Language of the filter texts: "en" or "vi". */
  lang: 'en' | 'vi' = 'en';

  mangaDetailsAuthorHeading = 'author(s)';
  mangaDetailsStatusHeading = 'status';
  searchPath = 'search';
  userAgent = USER_AGENT;

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  text(key: keyof (typeof STRINGS)['en']): string {
    return STRINGS[this.lang][key];
  }

  async fetchDocument(url: string): Promise<HtmlElement> {
    const response = await http.get(url, { headers: this.headers() });
    return html.load(response.body, { baseUrl: response.url });
  }

  // ============================== Common ======================================
  parseMangaPage(
    document: HtmlElement,
    selector: string,
    fromElement: (element: HtmlElement) => MangaSummary,
    hasNextPage?: boolean,
  ): MangaPage {
    const items = selectIgnoreCase(document, selector).map(fromElement);
    const next = this.latestUpdatesNextPageSelector();
    return { items, hasNextPage: hasNextPage ?? (next ? document.selectFirst(next) !== null : false) };
  }

  // ============================== Popular ======================================
  popularMangaSelector(): string {
    return '#slide-top > .item';
  }

  popularMangaFromElement(element: HtmlElement): MangaSummary {
    const link = element.selectFirst('.info-item a');
    return {
      url: relativeUrl(link?.attr('href') ?? ''),
      title: link?.text() ?? '',
      thumbnailUrl: this.imgAttr(element.selectFirst('.img-item img')) || undefined,
    };
  }

  async getPopular(): Promise<MangaPage> {
    const document = await this.fetchDocument(this.baseUrl);
    return this.parseMangaPage(document, this.popularMangaSelector(), (e) => this.popularMangaFromElement(e), false);
  }

  // ============================== Latest ======================================
  latestUpdatesSelector(): string {
    return '.page-item-detail';
  }

  latestUpdatesFromElement(element: HtmlElement): MangaSummary {
    const link = element.selectFirst('.item-summary a');
    return {
      url: relativeUrl(link?.attr('href') ?? ''),
      title: link?.text() ?? '',
      thumbnailUrl: this.imgAttr(element.selectFirst('.item-thumb img')) || undefined,
    };
  }

  latestUpdatesNextPageSelector(): string | null {
    return 'ul.pager a[rel=next]';
  }

  async getLatest(page: number): Promise<MangaPage> {
    const document = await this.fetchDocument(`${this.baseUrl}/?page=${page}`);
    return this.parseMangaPage(document, this.latestUpdatesSelector(), (e) => this.latestUpdatesFromElement(e));
  }

  // ============================== Search ======================================
  searchMangaSelector(): string {
    return this.latestUpdatesSelector();
  }

  searchMangaFromElement(element: HtmlElement): MangaSummary {
    return this.latestUpdatesFromElement(element);
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    let url: string;
    if (query.trim()) {
      url = `${this.baseUrl}/${this.searchPath}?s=${encodeURIComponent(query.trim())}&page=${page}`;
    } else {
      const genre = typeof filters.genre === 'string' ? filters.genre : '';
      const order = typeof filters.orderBy === 'string' ? filters.orderBy : 'latest';
      url = genre ? `${this.baseUrl}/${genre}` : this.baseUrl;
      const params: string[] = [];
      // Can't sort in "All" or "Completed".
      if (genre.startsWith('genre/')) params.push(`m_orderby=${encodeURIComponent(order)}`);
      params.push(`page=${page}`);
      url += `?${params.join('&')}`;
    }
    const document = await this.fetchDocument(url);
    return this.parseMangaPage(document, this.searchMangaSelector(), (e) => this.searchMangaFromElement(e));
  }

  // ============================== Details ======================================
  ongoingStatusList = ['ongoing', 'đang ra'];
  completedStatusList = ['completed', 'hoàn thành', 'truyện full'];

  parseMangaDetails(document: HtmlElement, manga: MangaSummary): MangaDetails {
    const statusText =
      selectIgnoreCase(
        document,
        `div.summary-heading:contains(${this.mangaDetailsStatusHeading}) + div.summary-content`,
      )[0]?.text() ?? '';
    const lower = statusText.toLowerCase();
    const status: MangaStatus = this.ongoingStatusList.some((s) => lower.includes(s))
      ? 'ongoing'
      : this.completedStatusList.some((s) => lower.includes(s))
        ? 'completed'
        : 'unknown';
    return {
      url: manga.url,
      title: document.selectFirst('div.post-title h1')?.text() || manga.title,
      author:
        selectIgnoreCase(
          document,
          `div.summary-heading:contains(${this.mangaDetailsAuthorHeading}) + div.summary-content`,
        )[0]?.text() || undefined,
      description: document.selectFirst('div.summary__content')?.text() || undefined,
      genres: document.select('div.genres-content a[rel=tag]').map((a) => a.text()),
      status,
      thumbnailUrl: this.imgAttr(document.selectFirst('div.summary_image img')) || manga.thumbnailUrl,
    };
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    return this.parseMangaDetails(await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url)), manga);
  }

  // ============================== Chapters ======================================
  chapterListSelector(): string {
    return 'li.wp-manga-chapter';
  }

  parseChapterList(document: HtmlElement): Chapter[] {
    return document.select(this.chapterListSelector()).flatMap((element): Chapter[] => {
      const link = element.selectFirst('a');
      if (!link) return [];
      const date = element.selectFirst('span.chapter-release-date')?.text();
      return [
        {
          url: relativeUrl(link.attr('href') ?? ''),
          name: link.text(),
          uploadedAt: date ? this.parseRelativeDate(date) : undefined,
        },
      ];
    });
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    return this.parseChapterList(await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url)));
  }

  parseRelativeDate(date: string): number | undefined {
    const text = date.slice(0, date.lastIndexOf(' ')).trim();
    const match = /^(\d+)\s+(.+)$/.exec(text);
    if (!match) return undefined;
    const unit = UNITS.find(([names]) => names.includes(match[2]!));
    return unit ? Date.now() - Number(match[1]) * unit[1] : undefined;
  }

  // ============================== Pages ======================================
  pageListSelector(): string {
    return 'div.page-break img';
  }

  parsePageList(document: HtmlElement): Page[] {
    return document
      .select(this.pageListSelector())
      .map((element, index) => ({ index, imageUrl: this.imgAttr(element) }));
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    return this.parsePageList(await this.fetchDocument(absoluteUrl(this.baseUrl, chapter.url)));
  }

  // ============================== Filters ======================================
  genreListSelector(): string {
    return 'ul.page-genres li a';
  }

  genreOption(element: HtmlElement): SelectOption {
    return { name: element.text(), id: relativeUrl(element.absUrl('href') || element.attr('href') || '').slice(1) };
  }

  async fetchGenres(): Promise<SelectOption[]> {
    try {
      const document = await this.fetchDocument(`${this.baseUrl}/genre`);
      return document.select(this.genreListSelector()).map((e) => this.genreOption(e));
    } catch (error) {
      log.warn('Cannot load genres', error);
      return [];
    }
  }

  async getFilters(): Promise<Filter[]> {
    const genres = await this.fetchGenres();
    const options: SelectOption[] = [
      { name: this.text('genre_all'), id: '' },
      { name: this.text('genre_completed'), id: 'completed' },
      ...genres,
    ];
    return [
      { type: 'header', label: this.text('filter_ignored_warning') },
      {
        type: 'header',
        label: this.text('cannot_use_order_by_warning')
          .replace('%s', this.text('genre_all'))
          .replace('%s', this.text('genre_completed')),
      },
      { type: 'separator' },
      {
        type: 'select',
        id: 'genre',
        label: this.text('genre_filter_title'),
        options: options.map((o) => ({ label: o.name, value: o.id })),
        default: '',
      },
      {
        type: 'select',
        id: 'orderBy',
        label: this.text('order_by_filter_title'),
        options: [
          { label: this.text('order_by_latest'), value: 'latest' },
          { label: this.text('order_by_rating'), value: 'rating' },
          { label: this.text('order_by_most_views'), value: 'views' },
          { label: this.text('order_by_new'), value: 'new' },
        ],
        default: 'latest',
      },
    ];
  }

  // ============================== Utilities ======================================
  imgAttr(element: HtmlElement | null | undefined): string {
    if (!element) return '';
    for (const name of ['data-src', 'data-lazy-src'])
      if (element.attr(name) !== undefined) return element.absUrl(name) ?? '';
    if (element.attr('srcset') !== undefined) return (element.absUrl('srcset') ?? '').split(' ')[0] ?? '';
    if (element.attr('data-cfsrc') !== undefined) return element.absUrl('data-cfsrc') ?? '';
    return element.absUrl('src') ?? '';
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
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
      getPopular: () => this.getPopular(),
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
