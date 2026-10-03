import {
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaSummary,
  defineExtension,
} from '@matane/extension-sdk';
import { type GenreData, MangaThemesia } from './mangathemesia/MangaThemesia';

class MangaCan extends MangaThemesia {
  readonly name = 'Manga Can';
  readonly baseUrl = 'https://mangacanblog.com';

  override mangaUrlDirectory = '';
  override supportsLatest = false;
  override seriesGenreSelector = '.seriestugenre a[href*=genre]';
  override pageSelector = 'div.images img, img.ts-main-image';

  // Manga and chapter pages are single .html paths.
  override resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/(?:www\.)?mangacanblog\.com(\/[^/?#]+\.html)/i.exec(url.trim());
    return match?.[1] ? { url: match[1], title: '' } : null;
  }

  override searchMangaUrl(page: number, query: string, filters: FilterState): string {
    if (query.trim()) {
      return `${this.baseUrl}/cari/${encodeURIComponent(query.trim().replace(/\s+/g, '-').toLowerCase())}/${page}.html`;
    }
    const genre = typeof filters.genre === 'string' ? filters.genre : '';
    if (!genre) return `${this.baseUrl}/`;
    return /^https?:\/\//.test(genre) ? genre : this.absolute(genre);
  }

  override async getFilters(): Promise<Filter[]> {
    let genres: GenreData[] = [];
    try {
      genres = this.parseGenres(await this.fetchDocument(`${this.baseUrl}/`));
    } catch (error) {
      log.warn('Cannot load genres', error);
    }
    if (genres.length === 0) return [];
    return [
      { type: 'header', label: 'Text search ignores genre' },
      {
        type: 'select',
        id: 'genre',
        label: 'Genre',
        options: [{ label: 'All', value: '' }, ...genres.map((g) => ({ label: g.name, value: g.value }))],
      },
    ];
  }

  override parseGenres(document: HtmlElement): GenreData[] {
    return document
      .select('.textwidget.custom-html-widget a')
      .map((a) => ({ name: a.text(), value: a.attr('href') ?? '' }))
      .filter((g) => g.name && g.value);
  }
}

export default defineExtension({
  createSource: () => new MangaCan().toSource(),
});
