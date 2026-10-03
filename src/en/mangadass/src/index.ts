import { type MangaPage, defineExtension } from '@matane/extension-sdk';
import { MadaraNoAjax } from './madara/MadaraNoAjax';

class MangaDass extends MadaraNoAjax {
  readonly name = 'Manga Dass';
  readonly baseUrl = 'https://mangadass.com';

  override chapterDatePattern = 'dd MMM yyyy';
  override archiveUrlSelector = 'a';
  override archiveTitleSelector = 'h3';
  override nextPageSelector(): string {
    return 'ul.pagination li.next a';
  }
  override orderQueryParameter = 'orderby';
  override searchQueryParameter = 'q';
  override chapterListSelector(): string {
    return '.row-content-chapter li';
  }
  override chapterDateSelector = '.chapter-time';
  override pageListParseSelector = '.read-content img';
  override filterGenresSelector = 'div.container';

  override getPopular(page: number): Promise<MangaPage> {
    return this.archivePage(page, 'trending');
  }

  // Pages are "/manga/<n>/" instead of "/manga/page/<n>/".
  override archiveUrl(page: number, order: string, path: string, query: string): string {
    return super.archiveUrl(page, order, path, query).replace(/\/page\/(\d+)\/(?=\?|$)/, '/$1/');
  }

  override searchUrl(page: number, query: string): string {
    return `${this.baseUrl}/search?q=${encodeURIComponent(query)}&post_type=wp-manga${page > 1 ? `&page=${page}` : ''}`;
  }
}

export default defineExtension({
  createSource: () => new MangaDass().toSource(),
});
