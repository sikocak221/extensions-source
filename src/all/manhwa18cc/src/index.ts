import { type MangaPage, defineExtension } from '@matane/extension-sdk';
import { MadaraNoAjax } from './madara/MadaraNoAjax';

class Manhwa18cc extends MadaraNoAjax {
  constructor(readonly lang: string) {
    super();
    this.mangaSubString = lang === 'ko' ? 'raw' : 'webtoons';
  }

  readonly name = 'Manhwa18.cc';
  readonly baseUrl = 'https://manhwa18.cc';

  override archiveSelector(): string {
    if (this.lang === 'en') return "div.manga-item:not(:has(h3 a[title$='Raw']))";
    if (this.lang === 'ko') return "div.manga-item:has(h3 a[title$='Raw'])";
    return 'div.manga-item';
  }

  override getPopular(page: number): Promise<MangaPage> {
    return this.archivePage(page, 'trending');
  }

  override getLatest(page: number): Promise<MangaPage> {
    return this.archivePage(page, '');
  }

  override archiveUrl(page: number, order: string, path: string, query: string): string {
    const params: string[] = [];
    if (order) params.push(`${this.orderQueryParameter}=${encodeURIComponent(order)}`);
    if (query) params.push(`${this.searchQueryParameter}=${encodeURIComponent(query)}`);
    const base = `${this.absolute(path).replace(/\/+$/, '')}${page > 1 ? `/${page}` : ''}`;
    return params.length > 0 ? `${base}?${params.join('&')}` : base;
  }

  override searchUrl(page: number, query: string): string {
    return `${this.baseUrl}/search?${this.searchQueryParameter}=${encodeURIComponent(query)}&post_type=wp-manga${page > 1 ? `&page=${page}` : ''}`;
  }

  override chapterDatePattern = 'dd MMM yyyy';
  override archiveUrlSelector = 'div.manga-item div.data a';
  override nextPageSelector(): string {
    return 'ul.pagination li.next a';
  }
  override orderQueryParameter = 'orderby';
  override searchQueryParameter = 'q';
  override mangaDetailsSelectorDescription = 'div.panel-story-description div.dsct';
  override chapterListSelector(): string {
    return 'li.a-h';
  }
  override chapterDateSelector = 'span.chapter-time';
  override pageListParseSelector = 'div.read-content img';
  override filterGenresSelector = '.header-bottom';
  override genreDirectory = 'webtoon-genre';
}

export default defineExtension({
  createSource: ({ lang }) => new Manhwa18cc(lang).toSource(),
});
