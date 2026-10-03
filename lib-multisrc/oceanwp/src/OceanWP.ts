// OceanWP (one-shot WordPress galleries), ported from keiyoushi/extensions-source lib-multisrc/oceanwp.
// This directory is a template: every extension using the theme keeps an identical copy in src/oceanwp/
// (`node scripts/sync-multisrc.mjs`) and overrides members in a subclass. Every post is one chapter.
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
import { USER_AGENT, absoluteUrl, hostOf, imgAttr, relativeUrl } from './utils';

export abstract class OceanWP {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;
  hasTagFilter = true;

  pageUrl(base: string, page: number): string {
    const url = base.endsWith('/') ? base : `${base}/`;
    return page > 1 ? `${url}page/${page}/` : url;
  }

  // Listing
  async getPopular(page: number): Promise<MangaPage> {
    const document = await this.fetchDocument(this.pageUrl(this.baseUrl, page));
    return this.parseList(document, 'article.blog-entry', 'h2.blog-entry-title a');
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const category = typeof filters.category === 'string' ? filters.category : '';
    const tag = typeof filters.tag === 'string' ? filters.tag : '';
    let url: string;
    if (query.trim()) url = `${this.pageUrl(this.baseUrl, page)}?s=${encodeURIComponent(query.trim())}`;
    else if (category) url = this.pageUrl(category, page);
    else if (tag) url = this.pageUrl(tag, page);
    else url = this.pageUrl(this.baseUrl, page);
    return this.parseList(await this.fetchDocument(url), 'article', 'h2.search-entry-title a, h2.blog-entry-title a');
  }

  parseList(document: HtmlElement, itemSelector: string, linkSelector: string): MangaPage {
    const items = document
      .select(itemSelector)
      .map((element) => this.mangaFromElement(element, linkSelector))
      .filter((manga): manga is MangaSummary => manga !== null);
    return { items, hasNextPage: document.selectFirst('ul.page-numbers li a.next') != null };
  }

  mangaFromElement(element: HtmlElement, linkSelector: string): MangaSummary | null {
    const link = element.selectFirst(linkSelector);
    if (!link) return null;
    return {
      url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
      title: link.text(),
      thumbnailUrl: imgAttr(element.selectFirst('div.thumbnail img')) || undefined,
    };
  }

  // Details: the post itself is the only chapter.
  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url));
    const content = document.selectFirst('div#content') ?? document;
    return {
      url: manga.url,
      title: content.selectFirst('.entry-title')?.text() || manga.title,
      description: content.selectFirst('div.entry-content')?.text() || undefined,
      genres: content.select('li.meta-cat a, li.meta-category a').map((a) => a.text()),
      thumbnailUrl: imgAttr(content.selectFirst('div.thumbnail img')) || manga.thumbnailUrl,
      status: 'completed',
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    return [{ url: manga.url, name: 'Chapter 1', number: 1 }];
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, chapter.url));
    return document
      .select('div.entry-content img')
      .map((img) => imgAttr(img))
      .filter(Boolean)
      .map((imageUrl, index) => ({ index, imageUrl }));
  }

  imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  // Filters: categories and tags from the home page menus.
  async getFilters(): Promise<Filter[]> {
    let categories: FilterOption[] = [];
    let tags: FilterOption[] = [];
    try {
      const document = await this.fetchDocument(this.baseUrl);
      const options = (selector: string) =>
        document.select(selector).map((a) => ({ label: a.text(), value: a.absUrl('href') || a.attr('href') || '' }));
      categories = options('ul.sub-menu li[class*=menu-item-type-taxonomy] a');
      if (this.hasTagFilter) tags = options('div.tagcloud a');
    } catch (error) {
      log.warn('Cannot load categories', error);
    }
    const filters: Filter[] = [{ type: 'header', label: 'Filter tidak bisa dikombinasikan dengan pencarian teks' }];
    if (categories.length > 0 && tags.length > 0) {
      filters.push({ type: 'header', label: 'Filter di bawah ini tidak bisa dikombinasikan satu sama lain' });
    }
    filters.push({ type: 'separator' });
    if (categories.length > 0) {
      filters.push({
        type: 'select',
        id: 'category',
        label: 'Category',
        options: [{ label: 'Default', value: '' }, ...categories],
      });
    }
    if (tags.length > 0) {
      filters.push({ type: 'select', id: 'tag', label: 'Tag', options: [{ label: 'Default', value: '' }, ...tags] });
    }
    return filters;
  }

  // URLs
  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)([^?#]*)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    const path = match[2] ?? '';
    if (!path.split('/').some(Boolean)) return null;
    return { url: path, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return absoluteUrl(this.baseUrl, item.url);
  }

  // Helpers
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
  }
}
