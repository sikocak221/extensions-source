// FuzzyDoodle, ported from keiyoushi/extensions-source lib-multisrc/fuzzydoodle (https://github.com/jhin1m/fuzzy-doodle).
// This directory is a template: every extension using the theme keeps an identical copy in src/fuzzydoodle/
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
import { USER_AGENT, absoluteUrl, hostOf, ownText, relativeUrl, withQuery } from './utils';

interface FilterOptions {
  types: [string, string][];
  statuses: [string, string][];
  genres: [string, string][];
}

export abstract class FuzzyDoodle {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  async fetchDocument(url: string): Promise<HtmlElement> {
    const response = await http.get(absoluteUrl(this.baseUrl, url), { headers: this.headers() });
    return html.load(response.body, { baseUrl: response.url });
  }

  // Popular
  popularMangaSelector(): string {
    return 'div#card-real';
  }

  popularMangaNextPageSelector(): string {
    return 'ul.pagination > li:last-child:not(.pagination-disabled)';
  }

  popularMangaFromElement(element: HtmlElement): MangaSummary {
    const link = element.selectFirst('a');
    return {
      url: relativeUrl(link?.absUrl('href') || link?.attr('href') || ''),
      title: element.selectFirst('h2.text-sm')?.text() ?? '',
      thumbnailUrl: this.imgAttr(element.selectFirst('img')) || undefined,
    };
  }

  parseList(
    document: HtmlElement,
    elements: HtmlElement[],
    nextSelector: string,
    fromElement: (element: HtmlElement) => MangaSummary,
  ): MangaPage {
    return {
      items: elements.map(fromElement).filter((manga) => manga.url && manga.title),
      hasNextPage: document.selectFirst(nextSelector) !== null,
    };
  }

  async getPopular(page: number): Promise<MangaPage> {
    const document = await this.fetchDocument(`${this.baseUrl}/manga?page=${page}`);
    return this.parseList(
      document,
      document.select(this.popularMangaSelector()),
      this.popularMangaNextPageSelector(),
      (e) => this.popularMangaFromElement(e),
    );
  }

  // Latest
  latestFromHomePage = false;

  latestHomePageUrl(page: number): string {
    return `${this.baseUrl}/?page=${page}`;
  }

  latestPageUrl(page: number): string {
    return `${this.baseUrl}/latest?page=${page}`;
  }

  latestUpdatesElements(document: HtmlElement): HtmlElement[] {
    if (!this.latestFromHomePage) return document.select(this.popularMangaSelector());
    // The sections are titled "Recent Chapters" / "Chapitres récents".
    return document
      .select('section')
      .filter((section) =>
        section
          .select('h2')
          .some((h2) => ['Recent Chapters', 'Chapitres récents'].some((t) => ownText(h2).includes(t))),
      )
      .flatMap((section) => section.select('div#card-real'));
  }

  latestUpdatesNextPageSelector(): string {
    return this.popularMangaNextPageSelector();
  }

  latestUpdatesFromElement(element: HtmlElement): MangaSummary {
    return this.popularMangaFromElement(element);
  }

  async getLatest(page: number): Promise<MangaPage> {
    const url = this.latestFromHomePage ? this.latestHomePageUrl(page) : this.latestPageUrl(page);
    const document = await this.fetchDocument(url);
    return this.parseList(document, this.latestUpdatesElements(document), this.latestUpdatesNextPageSelector(), (e) =>
      this.latestUpdatesFromElement(e),
    );
  }

  // Search
  searchMangaSelector(): string {
    return this.popularMangaSelector();
  }

  searchMangaNextPageSelector(): string {
    return this.popularMangaNextPageSelector();
  }

  searchMangaFromElement(element: HtmlElement): MangaSummary {
    return this.popularMangaFromElement(element);
  }

  searchUrl(query: string, page: number, filters: FilterState): string {
    const params: [string, string][] = [['title', query.trim()]];
    if (typeof filters.type === 'string') params.push(['type', filters.type]);
    if (typeof filters.status === 'string') params.push(['status', filters.status]);
    for (const [id, value] of Object.entries(filters)) {
      if (id.startsWith('genre.') && value === true) params.push(['genre[]', id.slice('genre.'.length)]);
    }
    if (page > 1) params.push(['page', String(page)]);
    return `${this.baseUrl}/manga?${params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}`;
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const document = await this.fetchDocument(this.searchUrl(query, page, filters));
    return this.parseList(
      document,
      document.select(this.searchMangaSelector()),
      this.searchMangaNextPageSelector(),
      (e) => this.searchMangaFromElement(e),
    );
  }

  // Filters
  parseFilters(document: HtmlElement): FilterOptions {
    const options = (selector: string): [string, string][] =>
      document.select(selector).map((o) => [ownText(o), o.attr('value') ?? ''] as [string, string]);
    return {
      types: options('select[name=type] > option'),
      statuses: options('select[name=status] > option'),
      genres: document.select('div.grid > div.flex:has(> input[name=genre[]])').flatMap((el) => {
        const label = el.selectFirst('label');
        const value = el.selectFirst('input')?.attr('value');
        return label && value !== undefined ? [[ownText(label), value] as [string, string]] : [];
      }),
    };
  }

  async getFilters(): Promise<Filter[]> {
    let data: FilterOptions;
    try {
      data = this.parseFilters(await this.fetchDocument(`${this.baseUrl}/manga`));
    } catch (error) {
      log.warn('Cannot load filters', error);
      return [];
    }
    const select = (id: string, label: string, list: [string, string][]): Filter[] =>
      list.length > 0
        ? [{ type: 'select', id, label, options: list.map(([name, value]) => ({ label: name, value })) }]
        : [];
    return [
      ...select('type', 'Type', data.types),
      ...select('status', 'Status', data.statuses),
      ...(data.genres.length > 0
        ? [
            {
              type: 'group' as const,
              id: 'genres',
              label: 'Genres',
              filters: data.genres.map(([label, value]): Filter => ({ type: 'checkbox', id: `genre.${value}`, label })),
            },
          ]
        : []),
    ];
  }

  // Details and chapters come from the same page.
  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    return this.mangaDetailsParse(await this.fetchDocument(manga.url), manga);
  }

  mangaDetailsParse(document: HtmlElement, manga: MangaSummary): MangaDetails {
    const genres: string[] = [];
    const root = document.selectFirst('main > section > div');
    const details: MangaDetails = { url: manga.url, title: manga.title, status: 'unknown' };
    if (root) {
      details.thumbnailUrl = this.imgAttr(root.selectFirst('div.relative img')) || manga.thumbnailUrl;
      details.title = ownText(root.selectFirst('div.flex > h1, div.flex > h2')) || manga.title;
      genres.push(...root.select('div.flex > a.inline-block').map((a) => a.text()));
      // The description block holds a label and a "show more" toggle besides the text.
      const block = root.selectFirst('div:has(> p#description)');
      let description = '';
      if (block) {
        const label = block.selectFirst('span.font-semibold')?.text() ?? '';
        const toggle = block.selectFirst('#show-more')?.text() ?? '';
        description = block.text();
        for (const part of [label, toggle]) if (part) description = description.replace(part, '');
        description = description.replace(/\s+/g, ' ').trim();
      }
      const alt = root.selectFirst('div.flex > h1 + div > span.text-sm, div.flex > h2 + div > span.text-sm')?.text();
      if (alt) description = `${description}\n\nAlternative Title: ${alt}`;
      details.description = description.trim() || undefined;
    }
    const info = document.selectFirst('div#buttons + div.hidden, div:has(> div#buttons) + div.flex');
    if (info) {
      details.status = this.parseStatus(this.getInfo(info, 'Status') ?? this.getInfo(info, 'Statut'));
      details.artist = this.removePlaceHolder(
        this.getInfo(info, 'Artist') ?? this.getInfo(info, 'المؤلف') ?? this.getInfo(info, 'Artiste'),
      );
      details.author = this.removePlaceHolder(
        this.getInfo(info, 'Author') ?? this.getInfo(info, 'الرسام') ?? this.getInfo(info, 'Auteur'),
      );
      const type = this.getInfo(info, 'Type') ?? this.getInfo(info, 'النوع');
      if (type) genres.unshift(type);
    }
    details.genres = genres.length > 0 ? genres : undefined;
    return details;
  }

  parseStatus(text: string | undefined): MangaStatus {
    if (!text) return 'unknown';
    const value = text.toLowerCase();
    const has = (words: string[]) => words.some((w) => value.includes(w));
    if (has(['ongoing', 'مستمر', 'en cours'])) return 'ongoing';
    if (has(['dropped', 'cancelled', 'متوقف'])) return 'cancelled';
    if (has(['completed', 'مكتمل', 'terminé'])) return 'completed';
    if (has(['hiatus'])) return 'hiatus';
    return 'unknown';
  }

  getInfo(root: HtmlElement, text: string): string | undefined {
    for (const paragraph of root.select('p')) {
      if (!paragraph.select('span').some((span) => ownText(span).includes(text))) continue;
      const value = paragraph.selectFirst('span.capitalize');
      if (value) return ownText(value);
    }
    return undefined;
  }

  removePlaceHolder(text: string | undefined): string | undefined {
    return text && text !== '-' ? text : undefined;
  }

  // Chapters
  chapterListSelector(): string {
    return 'div#chapters-list > a[href]';
  }

  chapterFromElement(element: HtmlElement): Chapter {
    return {
      url: relativeUrl(element.absUrl('href') || element.attr('href') || ''),
      name: ownText(element.selectFirst('#item-title, span')),
      uploadedAt: this.parseRelativeDate(element.selectFirst('span.text-gray-500')?.text()),
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const firstUrl = absoluteUrl(this.baseUrl, manga.url);
    const chapters: Chapter[] = [];
    let document = await this.fetchDocument(firstUrl);
    for (let page = 1; ; page++) {
      chapters.push(...document.select(this.chapterListSelector()).map((e) => this.chapterFromElement(e)));
      if (!document.selectFirst(this.latestUpdatesNextPageSelector())) break;
      document = await this.fetchDocument(withQuery(firstUrl, { page: String(page + 1) }));
    }
    return chapters;
  }

  // From Madara: "3 hours ago" in several languages.
  parseRelativeDate(text: string | undefined | null): number | undefined {
    const number = Number.parseInt(/(\d+)/.exec(text ?? '')?.[1] ?? '', 10);
    if (!text || Number.isNaN(number)) return undefined;
    const value = text.toLowerCase();
    const has = (words: string[]) => words.some((w) => value.includes(w));
    const now = new Date();
    const ago = (ms: number) => now.getTime() - number * ms;
    if (has(['detik', 'segundo', 'second', 'วินาที'])) return ago(1000);
    if (has(['menit', 'dakika', 'min', 'minute', 'minuto', 'นาที', 'دقائق'])) return ago(60_000);
    if (has(['jam', 'saat', 'heure', 'hora', 'hour', 'ชั่วโมง', 'giờ', 'ore', 'ساعة', '小时'])) return ago(3_600_000);
    if (has(['hari', 'gün', 'jour', 'día', 'dia', 'day', 'วัน', 'ngày', 'giorni', 'أيام', '天']))
      return ago(86_400_000);
    if (has(['week', 'sema'])) return ago(7 * 86_400_000);
    if (has(['month', 'mes'])) {
      now.setMonth(now.getMonth() - number);
      return now.getTime();
    }
    if (has(['year', 'año'])) {
      now.setFullYear(now.getFullYear() - number);
      return now.getTime();
    }
    return undefined;
  }

  // Pages
  async getPages(chapter: Chapter): Promise<Page[]> {
    const document = await this.fetchDocument(chapter.url);
    return document.select('div#chapter-container > img').map((img, index) => ({ index, imageUrl: this.imgAttr(img) }));
  }

  imgAttr(element: HtmlElement | null | undefined): string {
    if (!element) return '';
    if (element.attr('srcset') !== undefined) return element.attr('srcset')!.split(' ')[0] ?? '';
    for (const name of ['data-cfsrc', 'data-src', 'data-lazy-src']) {
      if (element.attr(name) !== undefined) return element.absUrl(name) || element.attr(name) || '';
    }
    return element.absUrl('src') || element.attr('src') || '';
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/manga\/([^/?#]+)/i.exec(url.trim());
    if (!match || match[1]!.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: `/manga/${match[2]}`, title: '' };
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
