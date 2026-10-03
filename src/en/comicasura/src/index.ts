import {
  type Chapter,
  type FilterState,
  type HtmlElement,
  type MangaPage,
  type MangaSummary,
  defineExtension,
} from '@matane/extension-sdk';
import { type GenreData, MangaThemesia } from './mangathemesia/MangaThemesia';

class ComicAsura extends MangaThemesia {
  readonly name = 'Comic Asura';
  readonly baseUrl = 'https://comicasura.net';

  override datePattern = 'MMMM d yyyy';
  override seriesDetailsSelector = '.bg-\\[\\#222222\\]:has(h1)';
  override seriesTitleSelector = '.comic-title-content';
  override seriesThumbnailSelector = 'img[alt=poster]';
  override seriesDescriptionSelector = '.comic-content.mobile';
  override seriesGenreSelector = 'div.hidden div:contains(Genres) + div > a';
  override seriesStatusSelector = 'div:contains(Status) + div';
  override pageSelector = 'div > img.object-cover.mx-auto';
  override orderByFilterOptions = [
    { label: 'Default', value: '' },
    // "name_asc" errors on the site.
    { label: 'Z-A', value: 'name_desc' },
    { label: 'Latest Update', value: 'latest' },
    { label: 'Popular', value: 'rating' },
  ];

  override getPopular(page: number): Promise<MangaPage> {
    return this.search('', page, { order: 'rating' });
  }

  override getLatest(page: number): Promise<MangaPage> {
    return this.search('', page, { order: 'latest' });
  }

  override searchMangaUrl(page: number, query: string, filters: FilterState): string {
    const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');
    const genres = Object.entries(filters)
      .filter(([id, value]) => id.startsWith('genre.') && (value === 'include' || value === 'exclude'))
      .map(([id]) => id.slice('genre.'.length));
    const params: [string, string][] = [
      ['name', query],
      ['page', String(page)],
      ['status', text('status')],
      ['type', text('type').toLowerCase()],
      ['sort', text('order')],
      ['genres', genres.join('_')],
    ];
    return `${this.baseUrl}/advanced-search/?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
  }

  override searchMangaSelector(): string {
    return '.grid > a[href*=manga], .flex-wrap.flex a[href*=manga]';
  }

  override searchMangaFromElement(element: HtmlElement): MangaSummary {
    const img = element.selectFirst('img');
    return {
      url: this.toRelative(element.absUrl('href') || element.attr('href') || ''),
      title: img?.attr('title') ?? '',
      thumbnailUrl: this.imgAttr(img) || undefined,
    };
  }

  override searchMangaNextPageSelector(): string | null {
    return 'a:has(img[alt=Next])';
  }

  override chapterListSelector(): string {
    return '.chapter-items';
  }

  override chapterFromElement(element: HtmlElement): Chapter {
    const date = element
      .selectFirst('.text-xs.text-\\[\\#A2A2A2\\]:not(:has(span))')
      ?.text()
      .replace(/(?<=\d)(st|nd|rd|th)/g, '');
    return {
      url: this.toRelative(element.selectFirst('a')?.attr('href') ?? ''),
      name: element
        .select('.text-sm.text-white')
        .map((el) => el.text())
        .join(' '),
      uploadedAt: this.parseChapterDate(date),
    };
  }

  override parseGenres(document: HtmlElement): GenreData[] {
    return document
      .select('.filter-dropdown-container label:has(input[name*=genres])')
      .map((label) => ({
        name: label.selectFirst('span')?.text() ?? '',
        value: label.selectFirst('input[type=checkbox]')?.attr('value') ?? '',
      }))
      .filter((g) => g.name && g.value);
  }
}

export default defineExtension({
  createSource: () => new ComicAsura().toSource(),
});
