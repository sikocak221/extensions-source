// Masonry (gallery sites), ported from keiyoushi/extensions-source lib-multisrc/masonry. This directory is a
// template: every extension using the theme keeps an identical copy in src/masonry/
// (`node scripts/sync-multisrc.mjs`).
//
// Every gallery is one manga with a single "Gallery" chapter whose url is the manga url.
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

const SORT_OPTIONS: FilterOption[] = [
  { label: 'Trending', value: 'sort/trending' },
  { label: 'Newest', value: 'sort/newest' },
  { label: 'Popular', value: 'sort/popular' },
];

export abstract class Masonry {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  async fetchDocument(url: string): Promise<HtmlElement> {
    const response = await http.get(url, { headers: this.headers() });
    return html.load(response.body, { baseUrl: response.url });
  }

  popularMangaUrl(page: number): string {
    if (page === 1) return this.baseUrl;
    if (page === 2) return `${this.baseUrl}/archive/`;
    return `${this.baseUrl}/archive/page/${page - 1}/`;
  }

  async getPopular(page: number): Promise<MangaPage> {
    return this.parseMangaList(await this.fetchDocument(this.popularMangaUrl(page)));
  }

  async getLatest(page: number): Promise<MangaPage> {
    return this.parseMangaList(await this.fetchDocument(`${this.baseUrl}/updates/sort/newest/mpage/${page}/`));
  }

  parseMangaList(document: HtmlElement): MangaPage {
    const items: MangaSummary[] = [];
    for (const element of document.select('.list-gallery:not(.static) figure')) {
      // Video entries (other sites' players) are not galleries.
      if (element.select('a').some((a) => (a.attr('href') ?? '').includes('/video/'))) continue;
      // Video entries and tag tiles (the home page starts with some) are not galleries.
      if (element.selectFirst('.icon-play')) continue;
      const link = element.selectFirst('a');
      if (!link || (link.attr('href') ?? '').includes('/tag/')) continue;
      const title = link.attr('title') || element.selectFirst('img')?.attr('alt') || '';
      if (!title) continue;
      items.push({
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title,
        thumbnailUrl: this.imgAttr(element.selectFirst('img')) || undefined,
      });
    }
    return { items, hasNextPage: document.selectFirst('.pagination-a li.next') != null };
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const text = query.trim();
    let url: string;
    if (text) {
      url = `${this.baseUrl}/search/post/${encodeURIComponent(text)}/mpage/${page}/`;
    } else {
      const tag = typeof filters.tag === 'string' ? filters.tag : '';
      const sortIndex = SORT_OPTIONS.findIndex((o) => o.value === filters.sort);
      const sort = sortIndex < 0 ? 0 : sortIndex;
      const sortValue = SORT_OPTIONS[sort]!.value;
      if (!tag) {
        // "Popular" has no sort segment on the updates listing.
        const part = sort === 2 ? '' : sortValue;
        url = part
          ? `${this.baseUrl}/updates/${part}/mpage/${page}/`
          : `${this.baseUrl}/updates/page/${page}/`;
      } else {
        // "Trending" is the default of tag listings.
        const part = sort === 0 ? '' : sortValue;
        url = part
          ? `${this.baseUrl}/tag/${tag}/${part}/mpage/${page}/`
          : `${this.baseUrl}/tag/${tag}/page/${page}/`;
      }
    }
    return this.parseMangaList(await this.fetchDocument(url));
  }

  async getFilters(): Promise<Filter[]> {
    const filters: Filter[] = [
      { type: 'header', label: 'Filters ignored with text search' },
      { type: 'separator' },
      { type: 'select', id: 'sort', label: 'Sort by', options: SORT_OPTIONS },
    ];
    try {
      const document = await this.fetchDocument(`${this.baseUrl}/updates/sort/newest/`);
      const tags = document
        .select('#filter-a span:has(> input)')
        .map((span) => ({
          label: span.selectFirst('label')?.text() ?? '',
          value: span.selectFirst('input')?.attr('value') ?? '',
        }))
        .filter((t) => t.label);
      if (tags.length > 0) {
        filters.push({ type: 'select', id: 'tag', label: 'Tags', options: [{ label: '', value: '' }, ...tags] });
      }
    } catch {
      // Tags are optional.
    }
    return filters;
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url));
    return this.parseMangaDetails(document, manga);
  }

  parseMangaDetails(document: HtmlElement, manga: MangaSummary): MangaDetails {
    const info = document.selectFirst('p.link-btn');
    const artist = info?.select('a[href*="/model/"]').map((a) => a.text());
    const genres = info?.select('a[href*="/tag/"]').map((a) => a.text());
    const title =
      manga.title ||
      document.selectFirst('h1')?.text() ||
      (document.selectFirst('title')?.text() ?? '').split(' - ')[0] ||
      manga.url;
    return {
      url: manga.url,
      title,
      thumbnailUrl: manga.thumbnailUrl,
      author: info?.selectFirst('a')?.text() || undefined,
      artist: artist && artist.length > 0 ? artist.join(', ') : undefined,
      genres: genres && genres.length > 0 ? genres : undefined,
      description: document.selectFirst('#content > p')?.text() || undefined,
      status: 'completed',
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    return [{ url: manga.url, name: 'Gallery' }];
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, chapter.url));
    return document
      .select('.list-gallery a[href^="https://cdn."]')
      .map((a, index) => ({ index, imageUrl: a.absUrl('href') || a.attr('href') || '' }));
  }

  imgAttr(element: HtmlElement | null | undefined): string {
    if (!element) return '';
    const srcset = element.attr('srcset');
    if (srcset) return (element.absUrl('srcset') || srcset).split(' ')[0]!;
    return imgAttr(element, ['data-cfsrc', 'data-src', 'data-lazy-src', 'src']);
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)(\/[^?#]*)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl) || match[2] === '/') return null;
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
