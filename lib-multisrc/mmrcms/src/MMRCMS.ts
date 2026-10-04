// MMRCMS (Manga Reader CMS), ported from keiyoushi/extensions-source lib-multisrc/mmrcms. This directory is a
// template: every extension using the theme keeps an identical copy in src/mmrcms/
// (`node scripts/sync-multisrc.mjs`) and overrides members in a subclass, like the Kotlin extensions do.
//
// Manga urls are the entry paths ("/manga/slug"), chapter urls the chapter paths.
import type {
  Chapter,
  Filter,
  FilterOption,
  FilterState,
  HtmlElement,
  MangaDetails,
  MangaPage,
  MangaStatus,
  MangaSummary,
  Page,
  Source,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, htmlToText, parseDate, relativeUrl } from './utils';

const MESSAGES: Record<string, Record<string, string>> = {
  en: {
    filter_warning: 'Ignored if using text search',
    category_filter_title: 'Category',
    status_filter_title: 'Status',
    type_filter_title: 'Type',
    year_filter_title: 'Year of release',
    author_filter_title: 'Author',
    tag_filter_title: 'Tag',
    title_begins_with_filter_title: 'Title begins with',
    sort_by_filter_title: 'Sort by',
  },
  es: {
    filter_warning: 'Ignorados si se realiza una búsqueda textual',
    category_filter_title: 'Categoría',
    status_filter_title: 'Estado',
    type_filter_title: 'Tipo',
    year_filter_title: 'Año de lanzamiento',
    author_filter_title: 'Autor',
    tag_filter_title: 'Etiqueta',
    title_begins_with_filter_title: 'El título comienza con',
    sort_by_filter_title: 'Ordenar por',
  },
};

interface Suggestion {
  value: string;
  data: string;
}

interface FilterData {
  categories: FilterOption[];
  statuses: FilterOption[];
  tags: FilterOption[];
  sortOptions: FilterOption[];
}

const ALPHA_OPTIONS: FilterOption[] = [
  { label: 'Any', value: '' },
  ...[...'#ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c) => ({ label: c, value: c })),
];

export abstract class MMRCMS {
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  abstract readonly lang: string;

  userAgent = USER_AGENT;

  /** The date format used for parsing chapter dates. */
  dateFormat = 'd MMM. yyyy';
  /** The path used in the url for entries. */
  itemPath = 'manga';
  /** Whether to fetch filtering options (categories, types, tags). */
  fetchFilterOptions = true;
  /** Whether the source supports advanced search under /advanced-search. */
  supportsAdvancedSearch = true;
  /** Selector for the entry's title in its details page. */
  detailsTitleSelector = '.listmanga-header, .widget-title';
  /** A word that always precedes the chapter title, e.g. "Scan ". */
  chapterNamePrefix = '';
  /** The word for "Chapter" in the source's language. */
  chapterString = '';

  detailAuthor = [
    'author(s)',
    'autor(es)',
    'auteur(s)',
    '著作',
    'yazar(lar)',
    'mangaka(lar)',
    'pengarang/penulis',
    'pengarang',
    'penulis',
    'autor',
    'المؤلف',
    'перевод',
    'autor/autorzy',
  ];
  detailArtist = ['artist(s)', 'artiste(s)', 'sanatçi(lar)', 'artista(s)', 'artist(s)/ilustrator', 'الرسام', 'seniman', 'rysownik/rysownicy', 'artista']; // prettier-ignore
  detailGenre = ['categories', 'categorías', 'catégories', 'ジャンル', 'kategoriler', 'categorias', 'kategorie', 'التصنيفات', 'жанр', 'kategori', 'tagi', 'género']; // prettier-ignore
  detailStatus = ['status', 'statut', 'estado', '状態', 'durum', 'الحالة', 'статус'];
  detailStatusComplete = ['complete', 'مكتملة', 'complet', 'completo', 'zakończone', 'concluído', 'finalizado'];
  detailStatusOngoing = ['ongoing', 'مستمرة', 'en cours', 'em lançamento', 'prace w toku', 'ativo', 'em andamento', 'activo', 'publicándose', 'publicandose']; // prettier-ignore
  detailStatusDropped = ['dropped'];

  intl(key: string): string {
    return (MESSAGES[this.lang] ?? MESSAGES.en!)[key] ?? MESSAGES.en![key] ?? key;
  }

  chapterWord(): string {
    if (this.chapterString) return this.chapterString;
    return this.lang === 'es' ? 'Capítulo' : this.lang === 'fr' ? 'Chapitre' : 'Chapter';
  }

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  async fetchDocument(url: string): Promise<HtmlElement> {
    const response = await http.get(url, { headers: this.headers() });
    return html.load(response.body, { baseUrl: response.url });
  }

  // Popular
  popularMangaUrl(page: number): string {
    return `${this.baseUrl}/filterList?page=${page}&sortBy=views&asc=false`;
  }

  async getPopular(page: number): Promise<MangaPage> {
    return this.popularMangaParse(await this.fetchDocument(this.popularMangaUrl(page)));
  }

  popularMangaParse(document: HtmlElement): MangaPage {
    const items = document.select(this.popularMangaSelector()).map((el) => this.popularMangaFromElement(el));
    const next = this.popularMangaNextPageSelector();
    return { items, hasNextPage: next ? !!document.selectFirst(next) : false };
  }

  popularMangaSelector(): string {
    return this.searchMangaSelector();
  }

  popularMangaFromElement(element: HtmlElement): MangaSummary {
    return this.searchMangaFromElement(element);
  }

  popularMangaNextPageSelector(): string | null {
    return this.searchMangaNextPageSelector();
  }

  // Latest
  latestUpdatesUrl(page: number): string {
    return `${this.baseUrl}/latest-release?page=${page}`;
  }

  async getLatest(page: number): Promise<MangaPage> {
    const document = await this.fetchDocument(this.latestUpdatesUrl(page));
    const seen = new Set<string>();
    const items = document
      .select(this.latestUpdatesSelector())
      .map((el) => this.latestUpdatesFromElement(el))
      .filter((m) => !seen.has(m.url) && seen.add(m.url));
    const next = this.latestUpdatesNextPageSelector();
    return { items, hasNextPage: next ? !!document.selectFirst(next) : false };
  }

  latestUpdatesSelector(): string {
    return 'div.mangalist div.manga-item';
  }

  latestUpdatesFromElement(element: HtmlElement): MangaSummary {
    return this.popularMangaFromElement(element);
  }

  latestUpdatesNextPageSelector(): string | null {
    return this.popularMangaNextPageSelector();
  }

  // Search
  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    if (!query && this.supportsAdvancedSearch) {
      const document = await this.fetchDocument(`${this.baseUrl}/advanced-search`);
      const params = this.filterParams(filters)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      const form: Record<string, string> = { params, page: String(page) };
      const script = document
        .select('script')
        .map((s) => s.html())
        .find((text) => text.includes('_token'));
      const token = script ? /['"]_token['"]\s*:\s*['"]([0-9A-Za-z]+)['"]/.exec(script)?.[1] : undefined;
      if (token) form._token = token;
      const response = await http.post(`${this.baseUrl}/advSearchFilter`, { form }, { headers: this.headers() });
      const result = html.load(response.body, { baseUrl: this.baseUrl });
      const next = this.searchMangaNextPageSelector();
      return {
        items: result.select(this.searchMangaSelector()).map((el) => this.searchMangaFromElement(el)),
        hasNextPage: next ? !!result.selectFirst(next) : false,
      };
    }
    return this.searchMangaFetch(page, query, filters);
  }

  /** Filter values as query parameters: the multi select ids look like "categories[].<value>". */
  filterParams(filters: FilterState): [string, string][] {
    const params: [string, string][] = [];
    for (const [id, value] of Object.entries(filters)) {
      if (typeof value === 'boolean') {
        const dot = id.indexOf('.');
        if (value && dot > 0) params.push([id.slice(0, dot), id.slice(dot + 1)]);
      } else if (typeof value === 'string') {
        if (id === 'sortBy') continue;
        if (value !== '') params.push([id, value]);
      } else if (typeof value === 'object' && id === 'sortBy') {
        params.push(['sortBy', value.value], ['asc', String(value.ascending)]);
      }
    }
    return params;
  }

  async searchMangaFetch(page: number, query: string, filters: FilterState): Promise<MangaPage> {
    if (query) {
      const url = `${this.baseUrl}/search?query=${encodeURIComponent(query)}`;
      const response = await http.get(url, { headers: this.headers() });
      const { suggestions } = JSON.parse(response.body) as { suggestions: Suggestion[] };
      return this.parseSearchDirectory(suggestions, page);
    }
    const query2 = [['page', String(page)] as [string, string], ...this.filterParams(filters)]
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    const document = await this.fetchDocument(`${this.baseUrl}/filterList?${query2}`);
    const next = this.searchMangaNextPageSelector();
    return {
      items: document.select(this.searchMangaSelector()).map((el) => this.searchMangaFromElement(el)),
      hasNextPage: next ? !!document.selectFirst(next) : false,
    };
  }

  searchMangaSelector(): string {
    return 'div.media';
  }

  searchMangaFromElement(element: HtmlElement): MangaSummary {
    const anchor = element.selectFirst('.media-heading a, .manga-heading a');
    const url = relativeUrl(anchor?.absUrl('href') || anchor?.attr('href') || '');
    return {
      url,
      title: anchor?.text() ?? '',
      thumbnailUrl: this.guessCover(url, this.imgAttr(element.selectFirst('img'))),
    };
  }

  searchMangaNextPageSelector(): string | null {
    return '.pagination a[rel=next]';
  }

  parseSearchDirectory(searchDirectory: Suggestion[], page: number): MangaPage {
    const items = searchDirectory.slice((page - 1) * 24, Math.min(page * 24, searchDirectory.length)).map((it) => {
      const url = `/${this.itemPath}/${it.data}`;
      return { url, title: it.value, thumbnailUrl: this.guessCover(url, null) };
    });
    return { items, hasNextPage: (page + 1) * 24 <= searchDirectory.length };
  }

  // Details and chapters come from the same page
  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const document = await this.fetchDocument(this.absolute(manga.url));
    return { ...this.mangaDetailsParse(document), url: manga.url };
  }

  mangaDetailsParse(document: HtmlElement): MangaDetails {
    const title = document.selectFirst(this.detailsTitleSelector)?.text() ?? '';
    const details: MangaDetails = {
      url: '',
      title,
      thumbnailUrl: this.guessCover(
        relativeUrl(document.selectFirst('link[rel=canonical]')?.attr('href') ?? ''),
        this.imgAttr(document.selectFirst('.row img.img-responsive')),
      ),
      status: 'unknown',
    };
    const well = document.selectFirst('.row .well');
    if (well) {
      const description = htmlToText(well.html().replace(/<h5[\s\S]*?<\/h5>/gi, '')).trim();
      if (description) details.description = description;
    }
    const terms = document.select('.row .dl-horizontal dt');
    const values = document.select('.row .dl-horizontal dt + *');
    terms.forEach((dt, i) => {
      const value = values[i];
      if (!value) return;
      const key = dt.text().toLowerCase().replace(/:$/, '');
      if (this.detailAuthor.includes(key)) details.author = value.text();
      else if (this.detailArtist.includes(key)) details.artist = value.text();
      else if (this.detailGenre.includes(key)) details.genres = value.select('a').map((a) => a.text());
      else if (this.detailStatus.includes(key)) details.status = this.toStatus(value.text().toLowerCase());
    });
    return details;
  }

  toStatus(text: string): MangaStatus {
    if (this.detailStatusComplete.includes(text)) return 'completed';
    if (this.detailStatusOngoing.includes(text)) return 'ongoing';
    if (this.detailStatusDropped.includes(text)) return 'cancelled';
    return 'unknown';
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    return this.chapterListParse(await this.fetchDocument(this.absolute(manga.url)));
  }

  async chapterListParse(document: HtmlElement): Promise<Chapter[]> {
    const title = document.selectFirst(this.detailsTitleSelector)?.text() ?? '';
    return document
      .select(this.chapterListSelector())
      .flatMap((el): Chapter[] => this.chapterFromElement(el, title) ?? []);
  }

  chapterListSelector(): string {
    return 'ul.chapters > li:not(.btn)';
  }

  chapterFromElement(element: HtmlElement, mangaTitle: string): Chapter[] | null {
    const wrapper = element.selectFirst('.chapter-title-rtl');
    const anchor = wrapper?.selectFirst('a');
    if (!wrapper || !anchor) return null;
    const dateText = element.selectFirst('.date-chapter-title-rtl')?.text();
    return [
      {
        url: relativeUrl(anchor.absUrl('href') || anchor.attr('href') || ''),
        name: this.cleanChapterName(mangaTitle, wrapper.text()),
        uploadedAt: dateText ? parseDate(dateText, this.dateFormat) : undefined,
      },
    ];
  }

  /**
   * Cleans up chapter names. Mostly useful for sites that don't know what a chapter title is and do
   * "One Piece 1234 : Chapter 1234".
   */
  cleanChapterName(mangaTitle: string, name: string): string {
    const initial = name.replace(this.chapterNamePrefix + mangaTitle, this.chapterWord());
    const colon = initial.indexOf(':');
    const splits = (colon < 0 ? [initial] : [initial.slice(0, colon), initial.slice(colon + 1)]).map((s) => s.trim());
    return splits.length < 2 || splits[0] === splits[1] ? splits[0]! : `${splits[0]}: ${splits[1]}`;
  }

  // Pages
  async getPages(chapter: Chapter): Promise<Page[]> {
    return this.pageListParse(await this.fetchDocument(this.absolute(chapter.url)));
  }

  pageListParse(document: HtmlElement): Page[] {
    return document
      .select('#all > img.img-responsive')
      .map((img, index) => ({ index, imageUrl: this.imgAttr(img) ?? '' }));
  }

  // Filters
  async fetchFilterData(): Promise<FilterData> {
    const pairs = (elements: HtmlElement[], value: (el: HtmlElement) => string | undefined): FilterOption[] =>
      elements.flatMap((el): FilterOption[] => {
        const v = value(el);
        return v === undefined ? [] : [{ label: el.text(), value: v }];
      });
    const lastSegment = (url: string | undefined) =>
      (url ?? '')
        .replace(/[?#].*$/, '')
        .replace(/\/+$/, '')
        .split('/')
        .pop();
    if (this.supportsAdvancedSearch) {
      const document = await this.fetchDocument(`${this.baseUrl}/advanced-search`);
      return {
        categories: pairs(document.select("select[name='categories[]'] option"), (el) => el.attr('value')),
        statuses: pairs(document.select("select[name='status[]'] option"), (el) => el.attr('value')),
        tags: pairs(document.select("select[name='types[]'] option"), (el) => el.attr('value')),
        sortOptions: [],
      };
    }
    const document = await this.fetchDocument(`${this.baseUrl}/${this.itemPath}-list`);
    return {
      categories: pairs(document.select('a.category'), (el) => /[?&]cat=([^&#]*)/.exec(el.absUrl('href') ?? '')?.[1]),
      statuses: [],
      tags: pairs(document.select('div.tag-links a'), (el) => lastSegment(el.absUrl('href'))),
      sortOptions: document.select('#sort-types label:has(input)').flatMap((label): FilterOption[] => {
        const id = label.selectFirst('input')?.attr('id');
        const text = label.text();
        return id ? [{ label: text, value: id }] : [];
      }),
    };
  }

  async getFilters(): Promise<Filter[]> {
    const data = this.fetchFilterOptions
      ? await this.fetchFilterData().catch((): FilterData => ({
          categories: [],
          statuses: [],
          tags: [],
          sortOptions: [],
        }))
      : { categories: [], statuses: [], tags: [], sortOptions: [] };
    const filters: Filter[] = [{ type: 'header', label: this.intl('filter_warning') }, { type: 'separator' }];
    const multi = (id: string, label: string, options: FilterOption[]): Filter => ({
      type: 'group',
      id,
      label,
      filters: options.map((o) => ({ type: 'checkbox', id: `${id}.${o.value}`, label: o.label })),
    });
    const select = (id: string, label: string, options: FilterOption[]): Filter => ({
      type: 'select',
      id,
      label,
      options: [{ label: 'Any', value: '' }, ...options],
      default: '',
    });
    if (this.supportsAdvancedSearch) {
      if (data.categories.length)
        filters.push(multi('categories[]', this.intl('category_filter_title'), data.categories));
      if (data.statuses.length) filters.push(multi('status[]', this.intl('status_filter_title'), data.statuses));
      if (data.tags.length) filters.push(multi('types[]', this.intl('type_filter_title'), data.tags));
      filters.push(
        { type: 'text', id: 'release', label: this.intl('year_filter_title') },
        { type: 'text', id: 'author', label: this.intl('author_filter_title') },
      );
    } else {
      if (data.categories.length) filters.push(select('cat', this.intl('category_filter_title'), data.categories));
      filters.push({
        type: 'select',
        id: 'alpha',
        label: this.intl('title_begins_with_filter_title'),
        options: ALPHA_OPTIONS,
        default: '',
      });
      if (data.tags.length) filters.push(select('tag', this.intl('tag_filter_title'), data.tags));
      if (data.sortOptions.length) {
        filters.push({
          type: 'sort',
          id: 'sortBy',
          label: this.intl('sort_by_filter_title'),
          options: data.sortOptions,
          default: { value: data.sortOptions[0]!.value, ascending: true },
        });
      }
    }
    return filters;
  }

  // Helpers
  guessCover(mangaUrl: string, url: string | null | undefined): string {
    if (!url || url.endsWith('no-image.png')) {
      return `${this.baseUrl}/uploads/manga/${mangaUrl.substring(mangaUrl.lastIndexOf('/') + 1)}/cover/cover_250x350.jpg`;
    }
    return url;
  }

  imgAttr(element: HtmlElement | null | undefined): string | undefined {
    if (!element) return undefined;
    for (const name of ['data-background-image', 'data-cfsrc', 'data-lazy-src', 'data-src']) {
      if (element.attr(name) !== undefined) return element.absUrl(name);
    }
    return element.absUrl('src');
  }

  absolute(url: string): string {
    return absoluteUrl(this.baseUrl, url);
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  resolveUrl(url: string): MangaSummary | null {
    if (hostOf(url) !== hostOf(this.baseUrl)) return null;
    const segments = relativeUrl(url).split('/').filter(Boolean);
    if (this.itemPath) {
      if (segments.length < 2 || segments[0] !== this.itemPath) return null;
      return { url: `/${segments[0]}/${segments[1]}`, title: '' };
    }
    return segments.length === 1 ? { url: `/${segments[0]}`, title: '' } : null;
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return this.absolute(item.url);
  }

  toSource(): Source {
    return {
      baseUrl: this.baseUrl,
      getPopular: (page) => this.getPopular(page),
      getLatest: (page) => this.getLatest(page),
      search: (query, page, filters) => this.search(query, page, filters),
      getFilters: () => this.getFilters(),
      getMangaDetails: (manga) => this.getMangaDetails(manga),
      getChapters: (manga) => this.getChapters(manga),
      getPages: (chapter) => this.getPages(chapter),
      imageHeaders: () => this.imageHeaders(),
      resolveUrl: (url) => this.resolveUrl(url),
      getWebUrl: (item) => this.getWebUrl(item),
    };
  }
}
