import {
  type Chapter,
  type FilterState,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { WPComics } from './wpcomics/WPComics';
import { absoluteUrl, withQuery } from './wpcomics/utils';

class XOXOComics extends WPComics {
  readonly name = 'XOXO Comics';
  readonly baseUrl = 'https://xoxocomic.com';

  override datePattern = 'MM/dd/yyyy';
  override gmtOffsetMinutes = null;
  override searchPath = 'search-comic';
  override popularPath = 'hot-comic';
  override genresSelector = '.genres h2:contains(Genres) + ul.nav li a';
  override chapterDateSelector = 'div.col-xs-3';

  override latestUpdatesSelector(): string {
    return 'li.row';
  }

  override async getLatest(page: number): Promise<MangaPage> {
    return this.parseList(
      await this.fetchDocument(`${this.baseUrl}/comic-update?page=${page}`),
      this.latestUpdatesSelector(),
      'img',
    );
  }

  // The keyword search ignores the genre and status filters.
  override searchUrl(query: string, page: number, filters: FilterState): string {
    if (query.trim())
      return withQuery(`${this.baseUrl}/${this.searchPath}`, { keyword: query.trim(), page: String(page) });
    const genre = typeof filters.genre === 'string' && filters.genre ? `/${filters.genre}` : '';
    return withQuery(`${this.baseUrl}${genre}`, {
      status: typeof filters.status === 'string' && filters.status ? filters.status : undefined,
      page: String(page),
      sort: '0',
    });
  }

  override genresUrl(): string {
    return `${this.baseUrl}/comic-list`;
  }

  override async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const chapters: Chapter[] = [];
    let url: string | undefined = absoluteUrl(this.baseUrl, manga.url);
    for (const seen = new Set<string>(); url && !seen.has(url);) {
      seen.add(url);
      const document = await this.fetchDocument(url);
      chapters.push(...this.chapterListParse(document));
      url = document.selectFirst('ul.pagination a[rel=next]')?.absUrl('href') || undefined;
    }
    return chapters;
  }

  override async getPages(chapter: Chapter): Promise<Page[]> {
    return this.pageListParse(await this.fetchDocument(`${absoluteUrl(this.baseUrl, chapter.url)}/all`));
  }
}

export default defineExtension({
  createSource: () => new XOXOComics().toSource(),
});
