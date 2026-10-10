// FMReader (Flat-Manga CMS), ported from keiyoushi/extensions-source lib-multisrc/fmreader. This directory is a
// template: every extension using the theme keeps an identical copy in src/fmreader/
// (`node scripts/sync-multisrc.mjs`).
import type {
  Chapter,
  Filter,
  FilterState,
  HtmlElement,
  MangaDetails,
  MangaPage,
  MangaStatus,
  MangaSummary,
  Page,
  Source,
} from '@matane/extension-sdk';
import { absoluteUrl, hostOf, parseDate, relativeUrl } from './utils';

export interface Genre {
  name: string;
  id: string;
}

const genre = (name: string): Genre => ({ name, id: name.replace(/ /g, '+') });

export abstract class FMReader {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  /** Java date pattern of absolute chapter dates. */
  readonly datePattern: string = 'd/M/yyyy';
  readonly requestPath: string = 'manga-list.html';
  readonly popularSort: string = 'sort=views';

  headers(): Record<string, string> {
    return {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
      Referer: `${this.baseUrl}/`,
      ...this.extraHeaders(),
    };
  }

  /** Extra request headers, e.g. a cookie. */
  extraHeaders(): Record<string, string> {
    return {};
  }

  async fetchDocument(url: string, headers: Record<string, string> = {}): Promise<HtmlElement> {
    const response = await http.get(url, { headers: { ...this.headers(), ...headers } });
    return html.load(response.body, { baseUrl: response.url });
  }

  imgAttr(element: HtmlElement | null | undefined): string | undefined {
    if (!element) return undefined;
    for (const name of ['data-original', 'data-src', 'data-bg', 'data-srcset']) {
      if (element.attr(name) != null) return element.absUrl(name);
    }
    const style = element.attr('style');
    if (style != null) return style.split('(').slice(1).join('(').split(')')[0];
    return element.absUrl('src');
  }

  // ============================== Listing ==============================
  popularMangaUrl(page: number): string {
    return `${this.baseUrl}/${this.requestPath}?listType=pagination&page=${page}&${this.popularSort}&sort_type=DESC`;
  }

  latestUpdatesUrl(page: number): string {
    return `${this.baseUrl}/${this.requestPath}?listType=pagination&page=${page}&sort=last_update&sort_type=DESC`;
  }

  searchMangaUrl(page: number, query: string, filters: FilterState): string {
    const params: [string, string][] = [
      ['name', query],
      ['page', String(page)],
    ];
    const text = (key: string, id: string) => {
      const value = filters[id];
      if (typeof value === 'string') params.push([key, value]);
    };
    text('author', 'author');
    text('group', 'group');
    const status = ['', '1', '2'][Number(typeof filters.status === 'string' ? filters.status : 0)] ?? '';
    params.push(['m_status', status]);
    const included: string[] = [];
    const excluded: string[] = [];
    for (const [id, value] of Object.entries(filters)) {
      if (!id.startsWith('genre.')) continue;
      if (value === 'include') included.push(id.slice(6));
      else if (value === 'exclude') excluded.push(id.slice(6));
    }
    params.push(['genre', included.join(',')], ['ungenre', excluded.join(',')]);
    const sort = typeof filters.sort === 'object' ? filters.sort : { value: 'views', ascending: false };
    params.push(['sort', sort.value]);
    if (sort.ascending) params.push(['sort_type', 'ASC']);
    return `${this.baseUrl}/${this.requestPath}?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
  }

  popularMangaSelector(): string {
    return 'div.media, .thumb-item-flow';
  }

  headerSelector(): string {
    return 'h3 a, .series-title a';
  }

  popularMangaNextPageSelector(): string {
    return 'div.col-lg-9 button.btn-info, .pagination a:contains(»):not(.disabled)';
  }

  popularMangaFromElement(element: HtmlElement): MangaSummary {
    const header = element.selectFirst(this.headerSelector());
    return {
      url: relativeUrl(header?.absUrl('href') ?? ''),
      title: element
        .select(this.headerSelector())
        .map((e) => e.text())
        .join(' ')
        .trim(),
      thumbnailUrl: this.imgAttr(element.selectFirst('img, .thumb-wrapper .img-in-ratio')),
    };
  }

  hasNextPage(document: HtmlElement): boolean {
    const text = document.selectFirst(this.popularMangaNextPageSelector())?.text() ?? '';
    if (/\w*\s\d*\s\w*\s\d*/.test(text)) {
      const parts = text.split(' ');
      return parts[1] !== parts[3];
    }
    return text.length > 0;
  }

  popularMangaParse(document: HtmlElement): MangaPage {
    return {
      items: document.select(this.popularMangaSelector()).map((e) => this.popularMangaFromElement(e)),
      hasNextPage: this.hasNextPage(document),
    };
  }

  async getPopular(page: number): Promise<MangaPage> {
    return this.popularMangaParse(await this.fetchDocument(this.popularMangaUrl(page)));
  }

  async getLatest(page: number): Promise<MangaPage> {
    return this.popularMangaParse(await this.fetchDocument(this.latestUpdatesUrl(page)));
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    return this.popularMangaParse(await this.fetchDocument(this.searchMangaUrl(page, query, filters)));
  }

  // ============================== Details ==============================
  infoElementSelector = 'div.row';
  mangaDetailsSelectorAuthor = 'li a.btn-info';
  mangaDetailsSelectorGenre = 'li a.btn-danger';
  mangaDetailsSelectorStatus = 'li a.btn-success';
  mangaDetailsSelectorDescription = 'div.detail .content, div.row ~ div.row:has(h3:first-child) p, .summary-content p';
  mangaDetailsSelectorThumbnail = 'img.thumbnail';
  altNameSelector = 'li:contains(Other names)';
  /** The alt name already contains ": " eg. ": alt name1, alt name2". */
  altName = 'Alternative Name';

  parseMangaTitle(document: HtmlElement): string {
    return document.selectFirst('.manga-info h1, .manga-info h3')?.text().trim() ?? '';
  }

  parseStatus(status: string | undefined): MangaStatus {
    if (!status) return 'unknown';
    const value = status.trim().toLowerCase();
    if (['completed', 'complete', 'đã hoàn thành', 'hoàn thành', 'tamamlandı'].includes(value)) return 'completed';
    if (
      [
        'ongoing',
        'on going',
        'updating',
        'incomplete',
        'chưa hoàn thành',
        'đang cập nhật',
        'đang tiến hành',
        'devam ediyor',
        'çevirisi bırakıldı',
        'çevirisi yok',
      ].includes(value)
    )
      return 'ongoing';
    return 'unknown';
  }

  /** Text of the element minus its children (the sandbox has no ownText()). */
  ownTextOf(element: HtmlElement): string {
    const text = element.html().replace(/<[^>]*>[\s\S]*?<\/[^>]*>|<[^>]*>/g, '');
    return text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .trim();
  }

  mangaDetailsParse(document: HtmlElement, manga: MangaSummary): MangaDetails {
    const info = document.selectFirst(this.infoElementSelector) ?? document;
    const author =
      info
        .select(this.mangaDetailsSelectorAuthor)
        .map((e) => e.text())
        .filter((t) => t.toLowerCase() !== 'updating')
        .join(', ') || undefined;
    let description = document
      .select(this.mangaDetailsSelectorDescription)
      .map((e) => e.text())
      .join(' ')
      .trim();
    const alt = info.select(this.altNameSelector)[0];
    if (alt) {
      const text = this.ownTextOf(alt);
      if (text && !/updating/i.test(text))
        description = description ? `${description}\n\n${this.altName}${text}` : this.altName + text;
    }
    return {
      url: manga.url,
      title: manga.title || this.parseMangaTitle(document),
      author,
      description: description || undefined,
      genres: info.select(this.mangaDetailsSelectorGenre).map((e) => e.text()),
      status: this.parseStatus(info.selectFirst(this.mangaDetailsSelectorStatus)?.text()),
      thumbnailUrl: this.imgAttr(info.selectFirst(this.mangaDetailsSelectorThumbnail)) ?? manga.thumbnailUrl,
    };
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url));
    return this.mangaDetailsParse(document, manga);
  }

  // ============================== Chapters ==============================
  chapterListSelector(): string {
    return 'div#list-chapters p, table.table tr, .list-chapters > a';
  }
  /** An empty selector means the element itself is the link. */
  chapterUrlSelector = 'a';
  chapterTimeSelector = 'time, .chapter-time, .publishedDate';
  chapterNameAttrSelector = 'title';
  dateValueIndex = 0;
  dateWordIndex = 1;

  parseRelativeDate(date: string): number {
    const parts = date.trim().split(' ');
    const value = Number.parseInt(parts[this.dateValueIndex] ?? '', 10);
    if (Number.isNaN(value)) return 0;
    const raw = parts[this.dateWordIndex] ?? '';
    const word = raw.includes('(') ? raw.slice(0, raw.indexOf('(')) : raw.replace(/s.*$/, '');
    const now = new Date();
    now.setSeconds(0, 0);
    const units: [string[], (d: Date) => void][] = [
      [['min', 'minute', 'phút', 'minuto', 'dakika'], (d) => d.setMinutes(d.getMinutes() - value)],
      [['hour', 'giờ', 'hora', 'saat'], (d) => d.setHours(d.getHours() - value)],
      [['day', 'ngày', 'día', 'gün'], (d) => d.setDate(d.getDate() - value)],
      [['week', 'tuần', 'semana', 'hafta'], (d) => d.setDate(d.getDate() - value * 7)],
      [['month', 'tháng', 'mes', 'ay'], (d) => d.setMonth(d.getMonth() - value)],
      [['year', 'năm', 'año', 'yıl'], (d) => d.setFullYear(d.getFullYear() - value)],
    ];
    const unit = units.find(([words]) => words.includes(word));
    if (!unit) return 0;
    unit[1](now);
    return now.getTime();
  }

  parseAbsoluteDate(text: string): number {
    return parseDate(text, this.datePattern) ?? 0;
  }

  chapterDate(element: HtmlElement): number | undefined {
    const text = element.selectFirst(this.chapterTimeSelector)?.text().trim();
    if (!text) return undefined;
    return this.parseRelativeDate(text) || this.parseAbsoluteDate(text) || undefined;
  }

  chapterFromElement(element: HtmlElement, mangaTitle = ''): Chapter {
    let link: HtmlElement | null | undefined;
    let name: string;
    if (this.chapterUrlSelector !== '') {
      link = element.selectFirst(this.chapterUrlSelector);
      name = link?.text() ?? '';
    } else {
      link = element;
      name = element.attr(this.chapterNameAttrSelector) ?? '';
    }
    const prefix = mangaTitle ? `${mangaTitle} ` : '';
    const index = prefix ? name.indexOf(prefix) : -1;
    return {
      url: relativeUrl(link?.absUrl('href') ?? ''),
      name: (index >= 0 ? name.slice(index + prefix.length) : name).trim(),
      uploadedAt: this.chapterDate(element),
    };
  }

  chapterListParse(document: HtmlElement): Chapter[] {
    const title = document.selectFirst('.manga-info h1, .manga-info h3')?.text() ?? '';
    const seen = new Set<string>();
    return document
      .select(this.chapterListSelector())
      .map((e) => this.chapterFromElement(e, title))
      .filter((c) => c.url !== '' && !seen.has(c.url) && !!seen.add(c.url));
  }

  async fetchChapterList(manga: MangaSummary, document: HtmlElement): Promise<Chapter[]> {
    void manga;
    return this.chapterListParse(document);
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url));
    return this.fetchChapterList(manga, document);
  }

  // ============================== Pages ==============================
  pageListImageSelector = 'img.chapter-img';

  pageListParse(document: HtmlElement, chapter: Chapter): Page[] {
    void chapter;
    return document
      .select(this.pageListImageSelector)
      .map((img, index): Page => ({ index, imageUrl: this.imgAttr(img) }))
      .filter((p) => !!p.imageUrl);
  }

  /** Images whose attribute is base64 (no dot in it) instead of a url. */
  base64PageListParse(document: HtmlElement): Page[] {
    return document.select(this.pageListImageSelector).map((img, index): Page => {
      const name =
        ['data-img', 'data-original', 'data-src', 'data-srcset', 'data-aload'].find((n) => img.attr(n) != null) ??
        'src';
      const value = img.attr(name) ?? '';
      return { index, imageUrl: value.includes('.') ? img.absUrl(name) : base64.decode(value) };
    });
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, chapter.url));
    return this.pageListParse(document, chapter);
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  // ============================== Filters ==============================
  genreList(): Genre[] {
    return [
      'Action',
      '18+',
      'Adult',
      'Anime',
      'Comedy',
      'Comic',
      'Doujinshi',
      'Drama',
      'Ecchi',
      'Fantasy',
      'Gender Bender',
      'Harem',
      'Historical',
      'Horror',
      'Josei',
      'Live action',
      'Manhua',
      'Manhwa',
      'Martial Art',
      'Mature',
      'Mecha',
      'Mystery',
      'One shot',
      'Psychological',
      'Romance',
      'School Life',
      'Sci-fi',
      'Seinen',
      'Shoujo',
      'Shojou Ai',
      'Shounen',
      'Shounen Ai',
      'Slice of Life',
      'Smut',
      'Sports',
      'Supernatural',
      'Tragedy',
      'Adventure',
      'Yaoi',
    ].map(genre);
  }

  getFilters(): Filter[] {
    return [
      { type: 'text', id: 'author', label: 'Author' },
      { type: 'text', id: 'group', label: 'Group' },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [
          { value: '0', label: 'Any' },
          { value: '1', label: 'Completed' },
          { value: '2', label: 'Ongoing' },
        ],
        default: '0',
      },
      {
        type: 'sort',
        id: 'sort',
        label: 'Sorted By',
        options: [
          { value: 'name', label: 'A-Z' },
          { value: 'views', label: 'Most views' },
          { value: 'last_update', label: 'Last updated' },
        ],
        default: { value: 'views', ascending: false },
      },
      {
        type: 'group',
        id: 'genres',
        label: 'Genre',
        filters: this.genreList().map((g): Filter => ({ type: 'tristate', id: `genre.${g.id}`, label: g.name })),
      },
    ];
  }

  resolveUrl(url: string): MangaSummary | null {
    if (hostOf(url) !== hostOf(this.baseUrl)) return null;
    const path = relativeUrl(url);
    return path.length > 1 ? { url: path, title: '' } : null;
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return absoluteUrl(this.baseUrl, item.url);
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
