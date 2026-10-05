// Madara with the admin-ajax "madara_load_more" listing (see MadaraBase.ts).
import type { Filter, FilterState, MangaPage } from '@matane/extension-sdk';
import { MadaraBase } from './MadaraBase';

type BrowseMode = 'popular' | 'latest' | 'search';

export abstract class Madara extends MadaraBase {
  pageSize = 25;
  ajaxTemplate = 'madara-core/content/content-archive';

  getPopular(page: number): Promise<MangaPage> {
    return this.ajaxList(page, 'popular');
  }

  getLatest(page: number): Promise<MangaPage> {
    return this.ajaxList(page, 'latest');
  }

  search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    return this.ajaxList(page, 'search', query.trim(), filters);
  }

  async getFilters(): Promise<Filter[]> {
    const genres = await this.fetchGenres();
    const filters: Filter[] = [
      { type: 'text', id: 'wp-manga-author', label: 'Author' },
      { type: 'text', id: 'wp-manga-artist', label: 'Artist' },
      { type: 'text', id: 'wp-manga-release', label: 'Year of release' },
      {
        type: 'group',
        id: 'status',
        label: 'Status',
        filters: this.statusFilterOptions.map((o) => ({ type: 'checkbox', id: `status.${o.value}`, label: o.label })),
      },
      { type: 'select', id: 'order', label: 'Order by', options: this.orderByFilterOptions },
      { type: 'select', id: 'adult', label: 'Adult content', options: this.adultFilterOptions },
    ];
    if (genres.length > 0) {
      filters.push(
        { type: 'separator' },
        { type: 'header', label: 'Genres may not work for all sources' },
        { type: 'select', id: 'genre_condition', label: 'Genre condition', options: this.genreConditionFilterOptions },
        {
          type: 'group',
          id: 'genre',
          label: 'Genres',
          filters: genres.map((g) => ({ type: 'checkbox', id: `genre.${g.slug}`, label: g.name })),
        },
      );
    }
    return filters;
  }

  async ajaxList(page: number, mode: BrowseMode, query = '', filters: FilterState = {}): Promise<MangaPage> {
    const form: Record<string, string> = {
      action: 'madara_load_more',
      page: String(page - 1),
      template: this.ajaxTemplate,
      'vars[paged]': '1',
      'vars[template]': 'archive',
      'vars[posts_per_page]': String(this.pageSize),
      'vars[post_type]': 'wp-manga',
      'vars[post_status]': 'publish',
      'vars[manga_archives_item_layout]': 'big_thumbnail',
    };
    if (this.filterNonMangaItems) {
      form['vars[meta_query][0][key]'] = '_wp_manga_chapter_type';
      form['vars[meta_query][0][value]'] = 'manga';
    }
    if (mode === 'popular') sort(form, '_wp_manga_views');
    else if (mode === 'latest') sort(form, '_latest_update');
    else this.addFilters(form, query, filters, this.filterNonMangaItems ? 1 : 0);

    const response = await http.post(
      `${this.baseUrl}/wp-admin/admin-ajax.php`,
      { form },
      { headers: this.xhrHeaders() },
    );
    const items = this.parseArchive(html.load(response.body, { baseUrl: this.baseUrl }));
    return { items, hasNextPage: items.length === this.pageSize };
  }

  addFilters(form: Record<string, string>, query: string, filters: FilterState, initialMetaQueryIndex: number): void {
    if (query) form['vars[s]'] = query;
    let meta = initialMetaQueryIndex;
    let tax = 0;
    const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string).trim() : '');

    for (const taxonomy of ['wp-manga-author', 'wp-manga-artist', 'wp-manga-release']) {
      if (!text(taxonomy)) continue;
      form[`vars[tax_query][${tax}][taxonomy]`] = taxonomy;
      form[`vars[tax_query][${tax}][field]`] = 'name';
      form[`vars[tax_query][${tax}][terms]`] = text(taxonomy);
      tax++;
    }
    const states = this.statusFilterOptions.map((o) => o.value).filter((v) => filters[`status.${v}`] === true);
    if (states.length > 0) {
      form[`vars[meta_query][${meta}][key]`] = '_wp_manga_status';
      form[`vars[meta_query][${meta}][compare]`] = 'IN';
      states.forEach((state, i) => (form[`vars[meta_query][${meta}][value][${i}]`] = state));
      meta++;
    }
    switch (text('order')) {
      case 'latest':
        sort(form, '_latest_update');
        break;
      case 'alphabet':
        form['vars[orderby]'] = 'post_title';
        form['vars[order]'] = 'ASC';
        break;
      case 'rating':
        form['vars[meta_query][query_average_reviews][key]'] = '_manga_avarage_reviews';
        form['vars[meta_query][query_average_reviews][compare]'] = 'EXISTS';
        form['vars[meta_query][query_total_reviews][key]'] = '_manga_total_votes';
        form['vars[meta_query][query_total_reviews][compare]'] = 'EXISTS';
        form['vars[orderby][query_average_reviews]'] = 'DESC';
        form['vars[orderby][query_total_reviews]'] = 'DESC';
        break;
      case 'trending':
        sort(form, '_wp_manga_week_views_value');
        break;
      case 'views':
        sort(form, '_wp_manga_views');
        break;
      case 'new-manga':
        form['vars[orderby]'] = 'date';
        form['vars[order]'] = 'DESC';
        break;
    }
    const adult = text('adult');
    if (adult) {
      form[`vars[meta_query][${meta}][key]`] = 'manga_adult_content';
      form[`vars[meta_query][${meta}][compare]`] = adult === '0' ? 'not exists' : 'exists';
      meta++;
    }
    const genres = Object.entries(filters)
      .filter(([id, value]) => id.startsWith('genre.') && value === true)
      .map(([id]) => id.slice('genre.'.length));
    if (genres.length > 0) {
      if (text('genre_condition') === '1') form[`vars[tax_query][${tax}][operation]`] = 'AND';
      form[`vars[tax_query][${tax}][taxonomy]`] = 'wp-manga-genre';
      form[`vars[tax_query][${tax}][field]`] = 'slug';
      genres.forEach((slug, i) => (form[`vars[tax_query][${tax}][terms][${i}]`] = slug));
    }
  }
}

function sort(form: Record<string, string>, key: string): void {
  form['vars[orderby]'] = 'meta_value_num';
  form['vars[meta_key]'] = key;
  form['vars[order]'] = 'DESC';
}
