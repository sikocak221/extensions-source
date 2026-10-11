import { type FilterState, defineExtension } from '@matane/extension-sdk';
import { MangaReader } from './mangareader/MangaReader';

class Jmanga extends MangaReader {
  readonly name = 'Jmanga';
  readonly baseUrl = 'https://jmanga.media';

  override searchPathSegment = '';
  override searchKeyword = 'q';
  override chapterIdSelect = 'ja-chaps';

  // The page number goes in "p".
  override searchMangaUrl(page: number, query: string, filters: FilterState): string {
    return super.searchMangaUrl(page, query, filters).replace(/([?&])page=(\d+)$/, '$1p=$2');
  }

  override getAjaxUrl(id: string): string {
    return `${this.baseUrl}/json/chapter?mode=vertical&id=${id}`;
  }
}

export default defineExtension({
  createSource: () => new Jmanga().toSource(),
});
