import { type FilterState, defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class NirvanaManga extends MangaThemesia {
  readonly name = 'Nirvana Manga';
  readonly baseUrl = 'https://nirvanamanga.com';

  // The `title` parameter of the archive is ignored by the site: text search goes through WordPress search.
  override searchMangaUrl(page: number, query: string, filters: FilterState): string {
    if (!query) return super.searchMangaUrl(page, query, filters);
    return `${this.baseUrl}/?s=${encodeURIComponent(query)}${page > 1 ? `&paged=${page}` : ''}`;
  }
}

export default defineExtension({
  createSource: () => new NirvanaManga().toSource(),
});
