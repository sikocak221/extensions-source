import {
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaPage,
  type MangaSummary,
  defineExtension,
} from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class RokariComics extends MangaThemesia {
  readonly name = 'RokariComics';
  readonly baseUrl = 'https://rokaricomics.com';

  override chapterListSelector(): string {
    return '#chapterlist li:has(div.chbox):has(div.eph-num):has(a[href]):not(:has(.text-gold))';
  }

  // Popular: the home page's "Popular Today" block (no pagination).
  override async getPopular(): Promise<MangaPage> {
    const document = await this.fetchDocument(this.baseUrl);
    return { items: this.homeSection(document, 'Popular'), hasNextPage: false };
  }

  // Latest: the home page's paginated "Latest Update" block.
  override async getLatest(page: number): Promise<MangaPage> {
    const document = await this.fetchDocument(page === 1 ? this.baseUrl : `${this.baseUrl}/page/${page}/`);
    return {
      items: this.homeSection(document, 'Latest'),
      hasNextPage: document.selectFirst('div.hpage .r, div.pagination .next') != null,
    };
  }

  homeSection(document: HtmlElement, heading: string): MangaSummary[] {
    return document
      .select(`.bixbox:has(h2:contains(${heading})) .bs .bsx`)
      .map((element) => {
        const link = element.selectFirst('a');
        return {
          url: this.toRelative(link?.attr('href') ?? ''),
          title: link?.attr('title') ?? '',
          thumbnailUrl: this.imgAttr(element.selectFirst('img')) || undefined,
        };
      })
      .filter((m) => m.url && m.title);
  }

  // Search moved from /manga/ to /?s=.
  override searchMangaUrl(page: number, query: string, filters: FilterState): string {
    const url = super.searchMangaUrl(page, query, filters);
    const params = url.slice(url.indexOf('?') + 1).replace(/(^|&)title=/, '$1s=');
    return `${this.baseUrl}/?${params}`;
  }

  override async getFilters(): Promise<Filter[]> {
    return (await super.getFilters()).filter((f) => !('id' in f) || !['author', 'year'].includes(f.id));
  }
}

export default defineExtension({
  createSource: () => new RokariComics().toSource(),
});
