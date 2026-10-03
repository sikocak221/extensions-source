// LoneSeal (JSON API sites), ported from keiyoushi/extensions-source lib-multisrc/loneseal.
// This file is a template: every extension using the theme keeps an identical copy in src/loneseal/
// (`node scripts/sync-multisrc.mjs` refreshes the copies) and overrides members in a subclass, like the
// Kotlin extensions do.
import type {
  Chapter,
  Filter,
  FilterOption,
  FilterState,
  MangaDetails,
  MangaPage,
  MangaStatus,
  MangaSummary,
  Page,
  Source,
} from '@matane/extension-sdk';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

export interface MangaDto {
  title: string;
  slug: string;
  poster_image_url?: string | null;
}

export interface SearchResponseDto {
  data: MangaDto[];
  total_pages: number;
}

export interface GenreDto {
  name: string;
  slug: string;
}

export interface ChapterDto {
  slug: string;
  number: string;
  title?: string | null;
  created_at?: string | null;
}

export interface SeriesDetailDto {
  title: string;
  slug: string;
  synopsis?: string | null;
  poster_image_url?: string | null;
  comic_status?: string | null;
  comic_subtype?: string | null;
  author_name?: string | null;
  artist_name?: string | null;
  primary_genre?: string | null;
  genres: GenreDto[];
  units: ChapterDto[];
}

export interface ChapterPagesResponseDto {
  chapter?: {
    login_required?: boolean | null;
    password_required?: boolean;
    pages?: { image_url: string }[];
  };
}

/** Where manga and chapter pages live on the site; urls stored by the app follow it. */
export type UrlLayout = 'SLUG' | 'LEGACY_COMIC' | 'LEGACY_ROOT' | 'LEGACY_SERIES';

const LAYOUTS: Record<UrlLayout, [mangaPrefix: string, chapterPrefix: string]> = {
  SLUG: ['', '/comic/'],
  LEGACY_COMIC: ['/comic/', '/comic/'],
  LEGACY_ROOT: ['/', '/comic/'],
  LEGACY_SERIES: ['/series/', '/series/'],
};

/** Genres too broad to be useful as a filter. */
export const OVERLOADED_GENRES = ['action', 'adult', 'drama', 'fantasy', 'romance', 'smut'];

const opt = (label: string, value: string): FilterOption => ({ label, value });

export abstract class LoneSeal {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;
  urlLayout: UrlLayout = 'SLUG';
  mangaUrlDirectory = 'comic';
  overloadedGenres: string[] = [...OVERLOADED_GENRES];
  includeChapterTitle = false;
  includeSeriesTagFilter = false;
  includeProjectOnlyFilter = false;

  /** `https://api.<site domain>/api` */
  get apiUrl(): string {
    const host = hostOf(this.baseUrl);
    return `https://api.${host.split('.').slice(-2).join('.')}/api`;
  }

  mangaUrl(slug: string): string {
    // Tachiyomi keeps a bare slug for SLUG; Matane urls are paths.
    if (this.urlLayout === 'SLUG') return `/${this.mangaUrlDirectory}/${slug}`;
    return `${LAYOUTS[this.urlLayout][0]}${slug}`;
  }

  chapterUrl(seriesSlug: string, chapterSlug: string): string {
    return `${LAYOUTS[this.urlLayout][1]}${seriesSlug}/chapter/${chapterSlug}`;
  }

  // Listing
  searchUrl(page: number, params: [string, string][]): string {
    const query: [string, string][] = [['type', 'COMIC'], ['limit', '20'], ['page', String(page)], ...params];
    return `${this.apiUrl}/search?${query.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}`;
  }

  toMangaPage(response: SearchResponseDto, page: number): MangaPage {
    return { items: response.data.map((manga) => this.toSummary(manga)), hasNextPage: page < response.total_pages };
  }

  toSummary(manga: MangaDto): MangaSummary {
    return {
      url: this.mangaUrl(manga.slug),
      title: manga.title.trim(),
      thumbnailUrl: manga.poster_image_url || undefined,
    };
  }

  async getPopular(page: number): Promise<MangaPage> {
    const url = this.searchUrl(page, [
      ['sort', 'views'],
      ['order', 'desc'],
    ]);
    return this.toMangaPage(await this.fetchJson<SearchResponseDto>(url), page);
  }

  async getLatest(_page: number): Promise<MangaPage> {
    const response = await this.fetchJson<{
      latest_comic_updates?: { series_title: string; series_slug: string; poster_image_url?: string | null }[];
    }>(`${this.apiUrl}/comic/home-sections?sections=latest_comic_updates&updateLimit=240`);
    const items = (response.latest_comic_updates ?? []).map((update) => ({
      url: this.mangaUrl(update.series_slug),
      title: update.series_title.trim(),
      thumbnailUrl: update.poster_image_url || undefined,
    }));
    return { items, hasNextPage: false };
  }

  /** Filter id → API query key. */
  queryKeys: Record<string, string> = {
    sort: 'sort',
    order: 'order',
    status: 'status',
    genre: 'genre',
    type: 'comic_type',
    color: 'color_format',
    reading: 'reading_format',
    series_tag: 'series_tag',
    project_only: 'project_only',
    author: 'author',
    artist: 'artist',
    publisher: 'publisher',
  };

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const params: [string, string][] = [];
    if (query.trim()) params.push(['q', query.trim()]);
    const values: FilterState = { sort: 'views', order: 'desc', ...filters };
    for (const [id, key] of Object.entries(this.queryKeys)) {
      const value = values[id];
      if (value === true) params.push([key, '1']);
      else if (typeof value === 'string' && value.trim()) params.push([key, value.trim()]);
    }
    const result = this.toMangaPage(await this.fetchJson<SearchResponseDto>(this.searchUrl(page, params)), page);
    const byTitle = (a: MangaSummary, b: MangaSummary) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    if (values.sort === 'az') result.items.sort(byTitle);
    else if (values.sort === 'za') result.items.sort((a, b) => byTitle(b, a));
    return result;
  }

  // Details and chapters (one API call)
  async fetchSeries(url: string): Promise<SeriesDetailDto> {
    return this.fetchJson<SeriesDetailDto>(`${this.apiUrl}/series/comic/${mangaSlug(url)}`);
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    return this.toDetails(await this.fetchSeries(manga.url));
  }

  toDetails(detail: SeriesDetailDto): MangaDetails {
    const genres = [
      ...new Set([...(detail.primary_genre ? [detail.primary_genre] : []), ...detail.genres.map((g) => g.name)]),
    ];
    const subtype = detail.comic_subtype?.toLowerCase();
    return {
      url: this.mangaUrl(detail.slug),
      title: detail.title.trim(),
      thumbnailUrl: detail.poster_image_url || undefined,
      author: detail.author_name || undefined,
      artist: detail.artist_name || undefined,
      description: detail.synopsis ? htmlToText(detail.synopsis) : undefined,
      genres: genres.length > 0 ? genres : undefined,
      status: parseStatus(detail.comic_status),
      type: subtype === 'manhwa' || subtype === 'manhua' || subtype === 'manga' ? subtype : undefined,
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const detail = await this.fetchSeries(manga.url);
    return detail.units.map((unit) => this.toChapter(unit, detail.slug));
  }

  toChapter(unit: ChapterDto, seriesSlug: string): Chapter {
    const number = Number.parseFloat(unit.number);
    let name = `Chapter ${unit.number.replace(/\.00$/, '')}`;
    if (this.includeChapterTitle && unit.title) name += ` - ${unit.title}`;
    const uploadedAt = unit.created_at ? Date.parse(unit.created_at) : Number.NaN;
    return {
      url: this.chapterUrl(seriesSlug, unit.slug),
      name,
      number: Number.isFinite(number) ? number : undefined,
      uploadedAt: Number.isFinite(uploadedAt) ? uploadedAt : undefined,
    };
  }

  // Pages
  async chapterHeaders(): Promise<Record<string, string>> {
    return this.headers();
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const [seriesSlug, chapterSlug] = chapterParts(chapter.url);
    const response = await http.get<ChapterPagesResponseDto>(
      `${this.apiUrl}/series/comic/${seriesSlug}/chapter/${chapterSlug}`,
      { headers: await this.chapterHeaders(), responseType: 'json' },
    );
    const pages = this.toPageList(response.body);
    if (pages.length === 0) this.onEmptyPages(response.body);
    return pages;
  }

  onEmptyPages(_dto: ChapterPagesResponseDto): void {}

  toPageList(dto: ChapterPagesResponseDto): Page[] {
    return (dto.chapter?.pages ?? []).map((page, index) => ({ index, imageUrl: page.image_url }));
  }

  imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  // Filters
  async getFilters(): Promise<Filter[]> {
    let genres: FilterOption[] = [];
    try {
      genres = (await this.fetchJson<GenreDto[]>(`${this.apiUrl}/genres`)).map((g) => opt(g.name, g.slug));
    } catch (error) {
      log.warn('Cannot load genres', error);
    }
    if (genres.length === 0) genres = FALLBACK_GENRES;
    genres = genres.filter((g) => g.value && !this.overloadedGenres.includes(g.value));

    const filters: Filter[] = [
      { type: 'select', id: 'sort', label: 'Sort', options: SORT_OPTIONS, default: 'views' },
      { type: 'select', id: 'order', label: 'Order', options: [opt('Descending', 'desc'), opt('Ascending', 'asc')] },
      { type: 'select', id: 'status', label: 'Status', options: STATUS_OPTIONS },
      { type: 'select', id: 'genre', label: 'Genre', options: [opt('All', ''), ...genres] },
      { type: 'select', id: 'type', label: 'Type', options: TYPE_OPTIONS },
      { type: 'select', id: 'color', label: 'Color', options: COLOR_OPTIONS },
      { type: 'select', id: 'reading', label: 'Reading', options: READING_OPTIONS },
    ];
    if (this.includeSeriesTagFilter) {
      filters.push({
        type: 'select',
        id: 'series_tag',
        label: 'Tag',
        options: [opt('All', ''), opt('ST8', 'ST8'), opt('BL', 'BL')],
      });
    }
    if (this.includeProjectOnlyFilter) filters.push({ type: 'checkbox', id: 'project_only', label: 'Project Only' });
    filters.push(
      { type: 'text', id: 'author', label: 'Author' },
      { type: 'text', id: 'artist', label: 'Artist' },
      { type: 'text', id: 'publisher', label: 'Publisher' },
    );
    return filters;
  }

  // URLs
  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)([^?#]*)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    const segments = (match[2] ?? '').split('/').filter(Boolean);
    if (segments[0] !== this.mangaUrlDirectory || !segments[1] || segments[2] === 'chapter') return null;
    return { url: this.mangaUrl(segments[1]), title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    if (item.url.includes('/chapter/')) {
      const [seriesSlug, chapterSlug] = chapterParts(item.url);
      return `${this.baseUrl}/${this.mangaUrlDirectory}/${seriesSlug}/chapter/${chapterSlug}`;
    }
    return `${this.baseUrl}/${this.mangaUrlDirectory}/${mangaSlug(item.url)}`;
  }

  // Helpers
  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/`, Accept: 'application/json' };
  }

  async fetchJson<T>(url: string): Promise<T> {
    const response = await http.get<T>(url, { headers: this.headers(), responseType: 'json' });
    return response.body;
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

// ---------------------------------------------------------------------------------------------

export function hostOf(url: string): string {
  return /^(?:https?:)?\/\/([^/?#]+)/i.exec(url)?.[1]?.toLowerCase() ?? '';
}

export function mangaSlug(url: string): string {
  return (
    url
      .replace(/^\/+|\/+$/g, '')
      .split('/')
      .pop() ?? ''
  );
}

export function chapterParts(url: string): [string, string] {
  const [series = '', chapter = ''] = url.replace(/^\/+|\/+$/g, '').split('/chapter/');
  return [series.split('/').pop() ?? '', chapter];
}

export function parseStatus(status: string | null | undefined): MangaStatus {
  switch (status?.toLowerCase()) {
    case 'ongoing':
      return 'ongoing';
    case 'completed':
      return 'completed';
    case 'hiatus':
      return 'hiatus';
    default:
      return 'unknown';
  }
}

/** Synopsis html → plain text with paragraph breaks and "text (link)" anchors. */
export function htmlToText(value: string): string {
  return value
    .replace(
      /<a\s+href\s*=\s*["']([^"']+)["'][^>]*>(.*?)<\/a>/gi,
      (_, href: string, text: string) => `${text.trim()} (${href.trim()})`,
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?p[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const SORT_OPTIONS = [
  opt('Latest', 'latest'),
  opt('New', 'new'),
  opt('Top Views', 'views'),
  opt('Top Rate', 'rate'),
  opt('Top Bookmark', 'bookmark'),
  opt('Title A-Z', 'az'),
  opt('Title Z-A', 'za'),
];
const STATUS_OPTIONS = [
  opt('All', ''),
  opt('Ongoing', 'ONGOING'),
  opt('Completed', 'COMPLETED'),
  opt('Hiatus', 'HIATUS'),
];
const TYPE_OPTIONS = [opt('All', ''), opt('Manga', 'MANGA'), opt('Manhwa', 'MANHWA'), opt('Manhua', 'MANHUA')];
const COLOR_OPTIONS = [opt('All', ''), opt('Full Color', 'FULL_COLOR'), opt('B&W', 'BW')];
const READING_OPTIONS = [opt('All', ''), opt('Vertical Scroll', 'VERTICAL_SCROLL'), opt('Page', 'PAGE')];
const FALLBACK_GENRES = [
  ['Action', 'action'], ['Adult', 'adult'], ['Adventure', 'adventure'], ['Comedy', 'comedy'], ['Drama', 'drama'],
  ['Ecchi', 'ecchi'], ['Fantasy', 'fantasy'], ['Gender Bender', 'gender-bender'], ['Harem', 'harem'],
  ['Historical', 'historical'], ['Horror', 'horror'], ['Isekai', 'isekai'], ['Josei', 'josei'],
  ['Martial Arts', 'martial-arts'], ['Mature', 'mature'], ['Mystery', 'mystery'], ['Psychological', 'psychological'],
  ['Romance', 'romance'], ['School Life', 'school-life'], ['Sci Fi', 'sci-fi'], ['Seinen', 'seinen'],
  ['Shoujo', 'shoujo'], ['Slice Of Life', 'slice-of-life'], ['Smut', 'smut'], ['Sports', 'sports'],
  ['Supernatural', 'supernatural'], ['Thriller', 'thriller'], ['Tragedy', 'tragedy'],
].map(([label, value]) => opt(label!, value!)); // prettier-ignore
