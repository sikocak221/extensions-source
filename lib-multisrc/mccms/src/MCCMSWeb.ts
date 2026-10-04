// MCCMS (漫城CMS, web variant), ported from keiyoushi/extensions-source lib-multisrc/mccms (MCCMSWeb). This
// directory is a template: every extension using the theme keeps an identical copy in src/mccms/
// (`node scripts/sync-multisrc.mjs`). The API variant (MCCMS) is not used by any ported site.
//
// Manga urls are the site's path without "/index.php" ("/comic/<slug>"), chapter urls likewise.
import type {
  Chapter,
  Filter,
  FilterOption,
  FilterState,
  HtmlElement,
  MangaDetails,
  MangaPage,
  MangaSummary,
  Page,
  Source,
} from '@matane/extension-sdk';
import { absoluteUrl, hostOf, ownText } from './utils';

export const PC_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0';
export const MOBILE_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

export interface MCCMSConfig {
  hasCategoryPage: boolean;
  textSearchOnlyPageOne: boolean;
  useMobilePageList: boolean;
  lazyLoadImageAttr: string;
}

const SORTS: FilterOption[] = [
  { label: '热门人气', value: 'order/hits' },
  { label: '更新时间', value: 'order/addtime' },
  { label: '评分', value: 'order/score' },
];

const STATUSES: FilterOption[] = [
  { label: '全部', value: '' },
  { label: '连载', value: 'finish/1' },
  { label: '完结', value: 'finish/2' },
];

export const removePathPrefix = (path: string) => path.replace(/^\/index\.php/, '');

export abstract class MCCMSWeb {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  config: MCCMSConfig = {
    hasCategoryPage: true,
    textSearchOnlyPageOne: false,
    useMobilePageList: false,
    lazyLoadImageAttr: 'data-original',
  };

  /** Genres of the category page as [label, tag id]; loaded once for the filters. */
  private genres: [string, string][] | undefined;

  pcHeaders(): Record<string, string> {
    return { 'User-Agent': PC_USER_AGENT };
  }

  mobileHeaders(): Record<string, string> {
    return { 'User-Agent': MOBILE_USER_AGENT };
  }

  searchHeaders(): Record<string, string> {
    return this.pcHeaders();
  }

  mobileUrl(url: string): string {
    return url.replace('//www.', '//m.');
  }

  async fetchDocument(url: string, headers: Record<string, string> = this.pcHeaders()): Promise<HtmlElement> {
    const response = await http.get(url, { headers });
    return html.load(response.body, { baseUrl: response.url });
  }

  // Listing
  /** `url` is the address the page was requested from. */
  parseListing(document: HtmlElement, _url: string): MangaPage {
    const items = document.select(this.simpleMangaSelector()).map((e) => this.simpleMangaFromElement(e));
    const buttons = (document.selectFirst('#Pagination, .NewPages') ?? document).select('a');
    const count = buttons.length;
    // Next page != Last page
    const hasNextPage = count >= 2 && buttons[count - 1]!.attr('href') !== buttons[count - 2]!.attr('href');
    return { items, hasNextPage };
  }

  simpleMangaSelector(): string {
    return '.common-comic-item';
  }

  simpleMangaFromElement(element: HtmlElement): MangaSummary {
    const link = element.selectFirst('.comic__title > a');
    return {
      url: removePathPrefix(link?.attr('href') ?? ''),
      title: ownText(link),
      thumbnailUrl: element.selectFirst('img')?.attr('data-original') || undefined,
    };
  }

  async getPopular(page: number): Promise<MangaPage> {
    const url = `${this.baseUrl}/category/order/hits/page/${page}`;
    return this.parseListing(await this.fetchDocument(url), url);
  }

  async getLatest(page: number): Promise<MangaPage> {
    const url = `${this.baseUrl}/category/order/addtime/page/${page}`;
    return this.parseListing(await this.fetchDocument(url), url);
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    let url: string;
    if (query.trim()) {
      url = this.config.textSearchOnlyPageOne
        ? `${this.baseUrl}/search?key=${encodeURIComponent(query)}`
        : `${this.baseUrl}/search/${query}/${page}`;
    } else {
      const text = (id: string, fallback = '') =>
        typeof filters[id] === 'string' ? (filters[id] as string) : fallback;
      const parts = [text('status'), text('sort', SORTS[0]!.value), text('genre')].filter(Boolean);
      url = `${this.baseUrl}/category/${parts.join('/')}${parts.length ? '/' : ''}page/${page}`;
    }
    return this.searchMangaParse(await this.fetchDocument(url, this.searchHeaders()), url);
  }

  searchMangaParse(document: HtmlElement, url: string): MangaPage {
    if (document.selectFirst('#code-div')) {
      throw new Error('该站要求输入验证码：请先在浏览器中打开网站完成验证后重试');
    }
    const result = this.parseListing(document, url);
    if (this.config.textSearchOnlyPageOne && url.includes('search')) return { items: result.items, hasNextPage: false };
    return result;
  }

  // Details and chapters come from the same page.
  async fetchMangaPage(manga: MangaSummary): Promise<HtmlElement> {
    return this.fetchDocument(`${this.baseUrl}${manga.url}`);
  }

  mangaDetailsParse(document: HtmlElement, manga: MangaSummary): MangaDetails {
    const element = document.selectFirst('.de-info__box');
    return {
      url: manga.url,
      title: ownText(element?.selectFirst('.comic-title')) || manga.title,
      thumbnailUrl: element?.selectFirst('img')?.attr('src') || manga.thumbnailUrl,
      author: element?.selectFirst('.name')?.text() || undefined,
      genres: element
        ?.selectFirst('.comic-status')
        ?.select('a')
        .map((a) => ownText(a)),
      description: element?.selectFirst('.intro-total')?.text() || undefined,
      status: 'unknown',
    };
  }

  chapterListSelector(): string {
    return '.chapter__list-box > li';
  }

  getDescendingChapters(chapters: Chapter[]): Chapter[] {
    return [...chapters].reverse();
  }

  chapterListParse(document: HtmlElement): Chapter[] {
    return this.getDescendingChapters(
      document.select(this.chapterListSelector()).flatMap((li): Chapter[] => {
        const link = li.selectFirst('a');
        if (!link) return [];
        return [{ url: removePathPrefix(link.attr('href') ?? ''), name: link.text() }];
      }),
    );
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    return this.mangaDetailsParse(await this.fetchMangaPage(manga), manga);
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    return this.chapterListParse(await this.fetchMangaPage(manga));
  }

  // Pages
  async getPages(chapter: Chapter): Promise<Page[]> {
    const response = await http.get(`${this.baseUrl}${chapter.url}`, {
      headers: this.config.useMobilePageList ? this.mobileHeaders() : this.pcHeaders(),
    });
    return this.pageListParse(response.body, response.url);
  }

  pageListParse(body: string, url: string): Page[] {
    const document = html.load(body, { baseUrl: url });
    const images = this.config.useMobilePageList
      ? (document.selectFirst('.comic-list')?.select('img') ?? []).map((img) => img.attr('src') ?? '')
      : document
          .select(`img[${this.config.lazyLoadImageAttr}]`)
          .map((img) => img.attr(this.config.lazyLoadImageAttr) ?? '');
    return images.filter(Boolean).map((imageUrl, index) => ({ index, imageUrl }));
  }

  /** The site must not get a Referer from image requests. */
  imageHeaders(): Record<string, string> {
    return this.pcHeaders();
  }

  // Filters
  async fetchGenresPage(): Promise<HtmlElement> {
    return this.fetchDocument(`${this.baseUrl}/category/`);
  }

  parseGenres(document: HtmlElement): [string, string][] {
    const box = document.selectFirst('.cate-selector, .cy_list_l, .ticai, .stui-screen__list');
    if (!box) throw new Error('Genre list not found');
    const links = box.select('a[href*="/tags/"]');
    if (links.length === 0) return [];
    return [
      ['全部', ''],
      ...links.map((a): [string, string] => [a.text(), (a.attr('href') ?? '').split('/').pop() ?? '']),
    ];
  }

  async getFilters(): Promise<Filter[]> {
    const filters: Filter[] = [
      { type: 'header', label: '分类筛选（搜索时无效）' },
      { type: 'select', id: 'status', label: '进度', options: STATUSES, default: '' },
      { type: 'select', id: 'sort', label: '排序', options: SORTS, default: SORTS[0]!.value },
    ];
    if (this.config.hasCategoryPage) {
      try {
        this.genres ??= this.parseGenres(await this.fetchGenresPage());
      } catch (error) {
        log.warn('Cannot load genres', error);
      }
      if (this.genres?.length)
        filters.push({
          type: 'select',
          id: 'genre',
          label: '标签',
          options: this.genres.map(([label, id]) => ({ label, value: id ? `tags/${id}` : '' })),
          default: '',
        });
    }
    return filters;
  }

  // URLs
  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)(\/(?:index\.php\/)?comic\/[^/?#]+)/i.exec(url.trim());
    if (!match) return null;
    const host = match[1]!.toLowerCase().replace(/^(www|m)\./, '');
    if (host !== hostOf(this.baseUrl).replace(/^(www|m)\./, '')) return null;
    return { url: removePathPrefix(match[2]!), title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return absoluteUrl(this.mobileUrl(this.baseUrl), item.url);
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
