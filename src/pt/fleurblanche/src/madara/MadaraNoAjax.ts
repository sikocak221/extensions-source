// Madara listing from the archive pages instead of admin-ajax (see MadaraBase.ts).
import type { Filter, FilterState, MangaPage } from '@matane/extension-sdk';
import { MadaraBase } from './MadaraBase';

export abstract class MadaraNoAjax extends MadaraBase {
  orderQueryParameter = 'm_orderby';
  searchQueryParameter = 's';

  nextPageSelector(): string {
    return 'div.nav-previous, a.nextpostslink, #navigation-ajax';
  }

  getPopular(page: number): Promise<MangaPage> {
    return this.archivePage(page, 'views');
  }

  getLatest(page: number): Promise<MangaPage> {
    return this.archivePage(page, 'latest');
  }

  async getFilters(): Promise<Filter[]> {
    const genres = await this.fetchGenres();
    const filters: Filter[] = [{ type: 'select', id: 'order', label: 'Order by', options: this.orderByFilterOptions }];
    if (genres.length > 0) {
      filters.push({
        type: 'select',
        id: 'genre',
        label: 'Genre',
        options: [{ label: 'All', value: '' }, ...genres.map((g) => ({ label: g.name, value: g.path }))],
      });
    }
    return filters;
  }

  search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const genre = typeof filters.genre === 'string' ? filters.genre : '';
    const order = typeof filters.order === 'string' ? filters.order : '';
    if (genre) return this.archivePage(page, order, genre, query.trim());
    return query.trim() ? this.htmlSearch(page, query.trim()) : this.archivePage(page, order);
  }

  archiveUrl(page: number, order: string, path: string, query: string): string {
    const params: string[] = [];
    if (order) params.push(`${this.orderQueryParameter}=${encodeURIComponent(order)}`);
    if (query) params.push(`${this.searchQueryParameter}=${encodeURIComponent(query)}`);
    const base = `${this.absolute(path).replace(/\/+$/, '')}/${page > 1 ? `page/${page}/` : ''}`;
    return params.length > 0 ? `${base}?${params.join('&')}` : base;
  }

  async archivePage(page: number, order: string, path = `/${this.mangaSubString}/`, query = ''): Promise<MangaPage> {
    const document = await this.fetchDocument(this.archiveUrl(page, order, path, query));
    return { items: this.parseArchive(document), hasNextPage: document.selectFirst(this.nextPageSelector()) != null };
  }

  searchUrl(page: number, query: string): string {
    return `${this.baseUrl}/${page > 1 ? `page/${page}/` : ''}?${this.searchQueryParameter}=${encodeURIComponent(query)}&post_type=wp-manga`;
  }

  async htmlSearch(page: number, query: string): Promise<MangaPage> {
    const document = await this.fetchDocument(this.searchUrl(page, query));
    const hasNextPage = document.selectFirst(this.nextPageSelector()) != null;
    const archive = this.parseArchive(document);
    return { items: archive.length > 0 ? archive : this.parseSearchCards(document), hasNextPage };
  }
}
