// ZManga, ported from keiyoushi/extensions-source lib-multisrc/zmanga. This directory is a template:
// every extension using the theme keeps an identical copy in src/zmanga/ (`node scripts/sync-multisrc.mjs`)
// and overrides members in a subclass, like the Kotlin extensions do.
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
import { USER_AGENT, absoluteUrl, hostOf, ownText, parseDate, relativeUrl, selectIgnoreCase, withQuery } from './utils';

export abstract class ZManga {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;
  datePattern = 'MMM d, yyyy';
  /** Some sites rename the advanced-search route (e.g. "advance-search"). */
  searchPath = 'advanced-search';
  projectPageString = '/project-list';
  hasProjectPage = false;

  typeFilterValues: FilterOption[] = [
    { label: 'All', value: '' },
    { label: 'Manga', value: 'Manga' },
    { label: 'Manhua', value: 'Manhua' },
    { label: 'Manhwa', value: 'Manhwa' },
    { label: 'One-Shot', value: 'One-Shot' },
    { label: 'Doujin', value: 'Doujin' },
  ];

  // Listing
  popularMangaSelector(): string {
    return 'div.flexbox2-item';
  }

  popularMangaNextPageSelector(): string {
    return 'div.pagination .next';
  }

  popularMangaFromElement(element: HtmlElement): MangaSummary {
    const link = element.selectFirst('div.flexbox2-content a');
    const img = element.selectFirst('img');
    return {
      url: relativeUrl(link?.absUrl('href') || link?.attr('href') || ''),
      title: element.selectFirst('div.flexbox2-title > span')?.text() ?? '',
      thumbnailUrl: img?.absUrl('src') || img?.attr('src') || undefined,
    };
  }

  parseListing(document: HtmlElement): MangaPage {
    const items = document
      .select(this.popularMangaSelector())
      .map((element) => this.popularMangaFromElement(element))
      .filter((manga) => manga.url && manga.title);
    return { items, hasNextPage: document.selectFirst(this.popularMangaNextPageSelector()) != null };
  }

  pagePathSegment(page: number): string {
    return page > 1 ? `page/${page}/` : '';
  }

  async getPopular(page: number): Promise<MangaPage> {
    return this.parseListing(
      await this.fetchDocument(`${this.baseUrl}/${this.searchPath}/${this.pagePathSegment(page)}?order=popular`),
    );
  }

  async getLatest(page: number): Promise<MangaPage> {
    return this.parseListing(
      await this.fetchDocument(`${this.baseUrl}/${this.searchPath}/${this.pagePathSegment(page)}?order=update`),
    );
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string).trim() : '');
    if (!query.trim() && this.hasProjectPage && filters.project === 'project-filter-on') {
      return this.parseListing(await this.fetchDocument(`${this.baseUrl}${this.projectPageString}/page/${page}`));
    }
    let url = withQuery(`${this.baseUrl}/${this.searchPath}/${this.pagePathSegment(page)}`, {
      title: query.trim(),
      author: text('author'),
      yearx: text('year'),
      status: filters.status === 'include' ? 'completed' : filters.status === 'exclude' ? 'ongoing' : '',
      type: text('type'),
      order: text('order'),
    });
    for (const [id, value] of Object.entries(filters)) {
      if (id.startsWith('genre.') && value === true)
        url += `&${encodeURIComponent('genre[]')}=${encodeURIComponent(id.slice(6))}`;
    }
    return this.parseListing(await this.fetchDocument(url));
  }

  // Details
  seriesTypeSelector = 'div.block span.type';
  altNameSelector = '.series-title span';
  altName = 'Alternative Name: ';

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    return this.mangaDetailsParse(await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url)), manga);
  }

  mangaDetailsParse(document: HtmlElement, manga: MangaSummary): MangaDetails {
    const thumb = document.selectFirst('div.series-thumb img');
    const genres = document.select('div.series-genres a').map((a) => a.text());
    const type = ownText(document.selectFirst(this.seriesTypeSelector));
    if (type && type !== '-' && !genres.some((g) => g.toLowerCase().includes(type.toLowerCase()))) genres.push(type);
    let description = document
      .select('div.series-synops')
      .map((el) => el.text())
      .join(' ')
      .trim();
    const altName = ownText(document.selectFirst(this.altNameSelector));
    if (altName)
      description = description ? `${description}\n\n${this.altName}${altName}` : `${this.altName}${altName}`;
    const lowerType = type.toLowerCase();
    return {
      url: manga.url,
      title: document.selectFirst('.series-title h2, .series-titlex h2')?.text() || manga.title,
      thumbnailUrl: thumb?.attr('data-lazy-src') || thumb?.absUrl('src') || manga.thumbnailUrl,
      author:
        selectIgnoreCase(document, '.series-infolist li:contains(Author) span')
          .map((el) => el.text())
          .join(' ') || undefined,
      artist:
        selectIgnoreCase(document, '.series-infolist li:contains(Artist) span')
          .map((el) => el.text())
          .join(' ') || undefined,
      status: this.parseStatus(ownText(document.selectFirst('.series-infoz .status'))),
      description: description || undefined,
      genres: genres.filter(Boolean),
      type: lowerType.includes('manhwa')
        ? 'manhwa'
        : lowerType.includes('manhua')
          ? 'manhua'
          : lowerType.includes('manga')
            ? 'manga'
            : undefined,
    };
  }

  parseStatus(status: string): MangaStatus {
    const value = status.toLowerCase();
    if (value.includes('ongoing')) return 'ongoing';
    if (value.includes('completed')) return 'completed';
    return 'unknown';
  }

  // Chapters (careful not to include the download links)
  chapterListSelector(): string {
    return 'ul.series-chapterlist div.flexch-infoz a';
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url));
    return document
      .select(this.chapterListSelector())
      .map((element) => this.chapterFromElement(element))
      .filter((chapter) => chapter.url);
  }

  chapterFromElement(element: HtmlElement): Chapter {
    return {
      url: relativeUrl(element.absUrl('href') || element.attr('href') || ''),
      name: ownText(element.selectFirst('span')) || element.text(),
      uploadedAt: parseDate(element.selectFirst('span.date')?.text(), this.datePattern),
    };
  }

  // Pages
  async getPages(chapter: Chapter): Promise<Page[]> {
    return this.pageListParse(await this.fetchDocument(absoluteUrl(this.baseUrl, chapter.url)));
  }

  pageListParse(document: HtmlElement): Page[] {
    return document
      .select('div.reader-area img:not(noscript img)')
      .map((img) => {
        const url = (img.attr('data-lazy-src')?.trim() || img.attr('src') || '').replace(/\\/g, '');
        return url ? absoluteUrl(this.baseUrl, url) : '';
      })
      .filter(Boolean)
      .map((imageUrl, index) => ({ index, imageUrl }));
  }

  imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  // Filters
  async getFilters(): Promise<Filter[]> {
    let genres: FilterOption[] = [];
    try {
      const document = await this.fetchDocument(`${this.baseUrl}/${this.searchPath}/`);
      genres = document.select('div.custom-checkbox').flatMap((box) => {
        const input = box.selectFirst('input[name="genre[]"]');
        const value = input?.attr('value');
        if (!value) return [];
        return [{ value, label: box.selectFirst('label')?.text() || input?.attr('id') || value }];
      });
    } catch (error) {
      log.warn('Cannot load genres', error);
    }
    const filters: Filter[] = [
      { type: 'header', label: 'You can combine filters.' },
      { type: 'separator' },
      { type: 'text', id: 'author', label: 'Author' },
      { type: 'text', id: 'year', label: 'Year' },
      { type: 'tristate', id: 'status', label: 'Completed' },
      { type: 'select', id: 'type', label: 'Type', options: this.typeFilterValues },
      {
        type: 'select',
        id: 'order',
        label: 'Order By',
        options: [
          { label: '<select>', value: '' },
          { label: 'A-Z', value: 'title' },
          { label: 'Z-A', value: 'titlereverse' },
          { label: 'Latest Update', value: 'update' },
          { label: 'Latest Added', value: 'latest' },
          { label: 'Popular', value: 'popular' },
          { label: 'Rating', value: 'rating' },
        ],
      },
    ];
    if (genres.length > 0) {
      filters.push({
        type: 'group',
        id: 'genre',
        label: 'Genres',
        filters: genres.map((g) => ({ type: 'checkbox', id: `genre.${g.value}`, label: g.label })),
      });
    }
    if (this.hasProjectPage) {
      filters.push(
        { type: 'separator' },
        { type: 'header', label: "NOTE: can't be used with other filters!" },
        {
          type: 'select',
          id: 'project',
          label: `${this.name} project list page`,
          options: [
            { label: 'Show all manga', value: '' },
            { label: 'Show only project manga', value: 'project-filter-on' },
          ],
        },
      );
    }
    return filters;
  }

  // URLs
  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)([^?#]*)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    const segments = (match[2] ?? '').split('/').filter(Boolean);
    if (segments.length < 2) return null;
    // Keep the site's own form (with or without the trailing slash) so it matches listed urls.
    return { url: `/${segments.join('/')}${(match[2] ?? '').endsWith('/') ? '/' : ''}`, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return absoluteUrl(this.baseUrl, item.url);
  }

  // Helpers
  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  async fetchDocument(url: string): Promise<HtmlElement> {
    const response = await http.get(url, { headers: this.headers() });
    return html.load(response.body, { baseUrl: response.url });
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
