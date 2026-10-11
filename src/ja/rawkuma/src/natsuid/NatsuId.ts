// NatsuId (WordPress theme by "Dzul Qurnain"), ported from keiyoushi/extensions-source
// lib-multisrc/natsuid. This directory is a template: every extension using the theme keeps an
// identical copy in src/natsuid/ (`node scripts/sync-multisrc.mjs`) and overrides members in a subclass.
//
// Manga urls are the manga page path ("/manga/<slug>/"); the WordPress REST API gives details and the
// post id that the chapter list needs.
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
  SortValue,
} from '@matane/extension-sdk';
import { USER_AGENT, decodeEntities, hostOf, htmlToText, ownText, parseDate, relativeUrl } from './utils';

export interface Term {
  name: string;
  slug: string;
  taxonomy: string;
}

export interface WpManga {
  id: number;
  slug: string;
  title: { rendered: string };
  content: { rendered: string };
  meta?: { meta?: { alternative_title?: string | null } | null } | null;
  metadata?: { meta?: { alternative_title?: string | null } | null } | null;
  _embedded: {
    'wp:featuredmedia'?: { source_url: string }[] | null;
    'wp:term'?: Term[][];
  };
}

const SORT_OPTIONS: FilterOption[] = [
  { label: 'Popular', value: 'popular' },
  { label: 'Rating', value: 'rating' },
  { label: 'Updated', value: 'updated' },
  { label: 'Bookmarked', value: 'bookmarked' },
  { label: 'Title', value: 'title' },
];
const TYPE_OPTIONS: FilterOption[] = [
  { label: 'Manga', value: 'manga' },
  { label: 'Manhwa', value: 'manhwa' },
  { label: 'Manhua', value: 'manhua' },
];
const STATUS_OPTIONS: FilterOption[] = [
  { label: 'Ongoing', value: 'ongoing' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'On Hiatus', value: 'on-hiatus' },
  { label: 'Unknown', value: 'unknown' },
];

export abstract class NatsuId {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;
  /** Java pattern for chapter dates; null = ISO dates in the `datetime` attribute. */
  datePattern: string | null = null;

  getPopular(page: number): Promise<MangaPage> {
    return this.search('', page, { sort: { value: 'popular', ascending: false } });
  }

  getLatest(page: number): Promise<MangaPage> {
    return this.search('', page, { sort: { value: 'updated', ascending: false } });
  }

  // Search: an admin-ajax search gives slugs, the REST API the details.
  private nonce: string | null = null;

  async getNonce(): Promise<string> {
    if (this.nonce) return this.nonce;
    const response = await http.get(`${this.baseUrl}/wp-admin/admin-ajax.php?type=search_form&action=get_nonce`, {
      headers: this.headers(),
    });
    const value = html.load(response.body).selectFirst('input[name=search_nonce]')?.attr('value');
    if (!value) throw new Error('Unable to get nonce');
    this.nonce = value;
    return value;
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const checked = (prefix: string) =>
      Object.entries(filters)
        .filter(([id, value]) => id.startsWith(prefix) && (value === true || value === 'include'))
        .map(([id]) => id.slice(prefix.length));
    const excluded = Object.entries(filters)
      .filter(([id, value]) => id.startsWith('genre.') && value === 'exclude')
      .map(([id]) => id.slice('genre.'.length));
    const sort = (filters.sort as SortValue | undefined) ?? { value: 'popular', ascending: false };
    const form: Record<string, string> = {
      nonce: await this.getNonce(),
      inclusion: typeof filters.inclusion === 'string' && filters.inclusion ? filters.inclusion : 'OR',
      exclusion: typeof filters.exclusion === 'string' && filters.exclusion ? filters.exclusion : 'OR',
      page: String(page),
      genre: JSON.stringify(checked('genre.')),
      genre_exclude: JSON.stringify(excluded),
      author: '[]',
      artist: '[]',
      project: filters.project === true ? '1' : '0',
      type: JSON.stringify(checked('type.')),
      status: JSON.stringify(checked('status.')),
      order: sort.ascending ? 'asc' : 'desc',
      orderby: sort.value,
      query: query.trim(),
    };
    const response = await http.post(
      `${this.baseUrl}/wp-admin/admin-ajax.php?action=advanced_search`,
      { form },
      {
        headers: this.headers(),
      },
    );
    return this.parseSearchManga(html.load(response.body, { baseUrl: this.baseUrl }));
  }

  async parseSearchManga(document: HtmlElement): Promise<MangaPage> {
    const slugs = [
      ...new Set(
        document
          .select('div > a[href*="/manga/"]:has(> img)')
          .map((a) => /\/manga\/([^/?#]+)/.exec(a.attr('href') ?? '')?.[1] ?? '')
          .filter(Boolean),
      ),
    ];
    if (slugs.length === 0) return { items: [], hasNextPage: false };
    const query = slugs.map((slug) => `slug[]=${encodeURIComponent(slug)}`).join('&');
    const mangas = await this.fetchJson<WpManga[]>(
      `${this.baseUrl}/wp-json/wp/v2/manga?${query}&per_page=${slugs.length + 1}&_embed`,
    );
    const bySlug = new Map(mangas.filter((m) => !isNovel(m)).map((m) => [m.slug, m]));
    const items = slugs
      .map((slug) => bySlug.get(slug))
      .filter((m): m is WpManga => m !== undefined)
      .map((m) => this.toSummary(m));
    return { items, hasNextPage: document.selectFirst('button:has(svg)') != null };
  }

  toSummary(manga: WpManga): MangaSummary {
    return {
      url: `/manga/${manga.slug}/`,
      title: decodeEntities(manga.title.rendered),
      thumbnailUrl: manga._embedded['wp:featuredmedia']?.[0]?.source_url,
    };
  }

  // Details
  async fetchManga(url: string): Promise<WpManga> {
    const slug =
      /\/manga\/([^/?#]+)/.exec(url)?.[1] ??
      url
        .replace(/^\/+|\/+$/g, '')
        .split('/')
        .pop() ??
      '';
    const [manga] = await this.fetchJson<WpManga[]>(
      `${this.baseUrl}/wp-json/wp/v2/manga?slug[]=${encodeURIComponent(slug)}&_embed`,
    );
    if (!manga) throw new Error(`Manga not found: ${slug}`);
    if (isNovel(manga)) throw new Error('Novels are not supported');
    return manga;
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    return this.toDetails(await this.fetchManga(manga.url));
  }

  toDetails(manga: WpManga): MangaDetails {
    const title = decodeEntities(manga.title.rendered);
    const meta = manga.meta ?? manga.metadata;
    const altTitles = [
      ...new Set(
        (meta?.meta?.alternative_title ?? '')
          .split(',')
          .map((t) => decodeEntities(t.trim()))
          .filter((t) => t && t.toLowerCase() !== title.toLowerCase()),
      ),
    ];
    let description = htmlToText(manga.content.rendered);
    if (altTitles.length > 0) {
      description = `${description ? `${description}\n\n` : ''}Alternative Names:\n${altTitles.map((t) => `- ${t}`).join('\n')}`;
    }
    const types = terms(manga, 'type');
    const statuses = terms(manga, 'status');
    let status: MangaStatus = 'unknown';
    if (statuses.includes('Ongoing')) status = 'ongoing';
    else if (statuses.includes('Completed')) status = 'completed';
    else if (statuses.includes('Cancelled')) status = 'cancelled';
    else if (statuses.includes('On Hiatus')) status = 'hiatus';
    const type = types.join(' ').toLowerCase();
    return {
      ...this.toSummary(manga),
      title,
      description: description || undefined,
      author: terms(manga, 'series-author').join(', ') || undefined,
      artist: terms(manga, 'artist').join(', ') || undefined,
      genres: [...new Set([...terms(manga, 'genre'), ...types])],
      status,
      type: type.includes('manhwa')
        ? 'manhwa'
        : type.includes('manhua')
          ? 'manhua'
          : type.includes('manga')
            ? 'manga'
            : undefined,
    };
  }

  // Chapters
  chapterListUrl(mangaId: string): string {
    // A page above 3 also loads the hidden chapters (Kotlin picks a random one; fixed here so
    // recorded fixtures replay).
    const page = 999;
    return `${this.baseUrl}/wp-admin/admin-ajax.php?manga_id=${mangaId}&page=${page}&action=chapter_list`;
  }

  chapterListSelector = 'div a:has(time)';
  chapterNameSelector = 'span';
  chapterDateSelector = 'time';
  chapterDateAttribute = 'datetime';

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const { id } = await this.fetchManga(manga.url);
    const response = await http.get(this.chapterListUrl(String(id)), { headers: this.headers() });
    // Long lists are huge (Kiryuu: ~4.6 KB of markup per chapter, 18 MB for 3,800 chapters), far too
    // much to load as a document within the sandbox's 2 s slice: read the standard markup as text.
    if (response.body.includes('data-chapter-number=')) return this.parseChapterListText(response.body);
    const document = html.load(response.body, { baseUrl: this.baseUrl });
    return document.select(this.chapterListSelector).map((element) => {
      const date = element.selectFirst(this.chapterDateSelector)?.attr(this.chapterDateAttribute);
      return {
        url: relativeUrl(element.absUrl('href') || element.attr('href') || ''),
        name: ownText(element.selectFirst(this.chapterNameSelector)) || element.text(),
        uploadedAt: this.parseChapterDate(date),
      };
    });
  }

  async parseChapterListText(body: string): Promise<Chapter[]> {
    const chapters: Chapter[] = [];
    const blocks = body.split('data-chapter-number=');
    for (let i = 1; i < blocks.length; i++) {
      if (i % 300 === 0) await timers.sleep(0);
      const block = blocks[i]!;
      const href = /<a\s[^>]*href="([^"]+)"/.exec(block)?.[1];
      if (!href) continue;
      const name = /<span[^>]*>([^<]+)<\/span>/.exec(block)?.[1]?.trim();
      const date = /<time[^>]*\sdatetime="([^"]+)"/.exec(block)?.[1];
      chapters.push({
        url: relativeUrl(decodeEntities(href)),
        name: name ? decodeEntities(name) : `Chapter ${/^["']?([\d.]+)/.exec(block)?.[1] ?? i}`,
        uploadedAt: this.parseChapterDate(date),
      });
    }
    return chapters;
  }

  parseChapterDate(date: string | null | undefined): number | undefined {
    if (!date) return undefined;
    if (this.datePattern) return parseDate(date, this.datePattern);
    const time = Date.parse(date);
    return Number.isNaN(time) ? undefined : time;
  }

  // Pages
  pageListSelector = 'main .relative section > img';

  async getPages(chapter: Chapter): Promise<Page[]> {
    const response = await http.get(`${this.baseUrl}${chapter.url}`, { headers: this.headers() });
    return html
      .load(response.body, { baseUrl: response.url })
      .select(this.pageListSelector)
      .map((img) => img.absUrl('src') || img.attr('src') || '')
      .filter(Boolean)
      .map((imageUrl, index) => ({ index, imageUrl }));
  }

  imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  // Filters
  async getFilters(): Promise<Filter[]> {
    const filters: Filter[] = [
      {
        type: 'sort',
        id: 'sort',
        label: 'Sort',
        options: SORT_OPTIONS,
        default: { value: 'popular', ascending: false },
      },
      {
        type: 'group',
        id: 'type',
        label: 'Type',
        filters: TYPE_OPTIONS.map((o) => ({ type: 'checkbox', id: `type.${o.value}`, label: o.label })),
      },
      {
        type: 'group',
        id: 'status',
        label: 'Status',
        filters: STATUS_OPTIONS.map((o) => ({ type: 'checkbox', id: `status.${o.value}`, label: o.label })),
      },
      { type: 'checkbox', id: 'project', label: 'Project Only' },
    ];
    try {
      const genres = await this.fetchJson<Term[]>(
        `${this.baseUrl}/wp-json/wp/v2/genre?per_page=100&page=1&orderby=count&order=desc`,
      );
      genres.sort((a, b) => a.name.localeCompare(b.name));
      const modes = [
        { label: 'OR', value: 'OR' },
        { label: 'AND', value: 'AND' },
      ];
      filters.push(
        {
          type: 'group',
          id: 'genre',
          label: 'Genre',
          filters: genres.map((g) => ({ type: 'tristate', id: `genre.${g.slug}`, label: decodeEntities(g.name) })),
        },
        { type: 'select', id: 'inclusion', label: 'Genre Inclusion Mode', options: modes },
        { type: 'select', id: 'exclusion', label: 'Genre Exclusion Mode', options: modes },
      );
    } catch (error) {
      log.warn('Cannot load genres', error);
    }
    return filters;
  }

  // URLs
  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/manga\/([^/?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: `/manga/${match[2]}/`, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return `${this.baseUrl}${item.url}`;
  }

  // Helpers
  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  /** Some sites prepend garbage to their JSON. */
  transformJsonResponse(body: string): string {
    return body;
  }

  async fetchJson<T>(url: string): Promise<T> {
    const response = await http.get(url, { headers: { ...this.headers(), Accept: 'application/json' } });
    return JSON.parse(this.transformJsonResponse(response.body)) as T;
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

function terms(manga: WpManga, taxonomy: string): string[] {
  return (
    (manga._embedded['wp:term'] ?? [])
      .find((group) => group[0]?.taxonomy === taxonomy)
      ?.map((term) => decodeEntities(term.name)) ?? []
  );
}

function isNovel(manga: WpManga): boolean {
  return terms(manga, 'type').includes('Novel');
}
