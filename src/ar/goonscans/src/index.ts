import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaPage,
  type MangaSummary,
  defineExtension,
} from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class GoonScans extends MangaThemesia {
  readonly name = 'Goon Scans';
  readonly baseUrl = 'https://goonscans.org';

  override mangaUrlDirectory = '/title';
  override datePattern = 'yyyy.dd.MM';

  override getPopular(page: number): Promise<MangaPage> {
    return this.search('', page, { orderby: 'top_rated' });
  }

  override getLatest(page: number): Promise<MangaPage> {
    return this.search('', page, { orderby: 'latest_chapter' });
  }

  override searchMangaUrl(page: number, query: string, filters: FilterState): string {
    if (query) return super.searchMangaUrl(page, query, filters);
    const orderby = typeof filters.orderby === 'string' ? filters.orderby : 'top_rated';
    return `${this.baseUrl}/title/${page > 1 ? `page/${page}/` : ''}?orderby=${encodeURIComponent(orderby)}`;
  }

  override searchMangaFromElement(element: HtmlElement): MangaSummary {
    const img = element.selectFirst('img');
    return {
      url: this.toRelative(element.selectFirst('a')?.attr('href') ?? ''),
      title: img?.attr('alt') ?? '',
      thumbnailUrl: this.imgAttr(img) || undefined,
    };
  }

  override chapterFromElement(element: HtmlElement): Chapter {
    return {
      url: this.toRelative(element.selectFirst('a')?.attr('href') ?? ''),
      name: element.selectFirst('.chapter-number')?.text() ?? '',
      uploadedAt: this.parseChapterDate(element.selectFirst('.chapter-date')?.text()),
    };
  }

  override async getFilters(): Promise<Filter[]> {
    return [];
  }
  override searchMangaNextPageSelector(): string {
    return '.next-btn';
  }
  override searchMangaSelector(): string {
    return '.cover-wrapper';
  }
  override seriesDetailsSelector = '.webtoon-container';
  override seriesTitleSelector = '.webtoon-title';
  override seriesThumbnailSelector = '.webtoon-cover';
  override seriesDescriptionSelector = '.description-content';
  override seriesGenreSelector = '.genre-tags a';
  override seriesStatusSelector = '.cover-status-badge';
  override chapterListSelector(): string {
    return 'ul.chapter-list li';
  }
}

export default defineExtension({
  createSource: () => new GoonScans().toSource(),
});
