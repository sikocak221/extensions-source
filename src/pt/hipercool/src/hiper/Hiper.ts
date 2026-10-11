// Hiper (tRPC API), ported from keiyoushi/extensions-source lib-multisrc/hiper. This directory is a template:
// every extension using the theme keeps an identical copy in src/hiper/ (`node scripts/sync-multisrc.mjs`).
//
// The API wants the "__st" cookie the home page sets. Manga urls are "/<manga path>/<slug>", chapter urls
// "/<manga path>/<slug>/<number>#<chapter id>". Not ported: the WebView fallback for page headers.
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
  Preference,
  Source,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf } from './utils';

const RATINGS: FilterOption[] = [
  { label: 'Pornographic', value: 'pornographic' },
  { label: 'Erotica', value: 'erotica' },
  { label: 'Suggestive', value: 'suggestive' },
  { label: 'Safe', value: 'safe' },
];

export const MAX_RATING_PREFERENCE: Preference = {
  type: 'select',
  key: 'MAX_RATING',
  label: 'Default max rating',
  description: 'Restricts content to the selected rating or below.',
  options: RATINGS,
  default: 'pornographic',
};

interface MangaDto {
  id: number;
  slug: string;
  title: string;
  synopsis?: string | null;
  coverUrl?: string | null;
  status?: string | null;
  genres?: string[] | null;
  authors?: string[] | null;
  artists?: string[] | null;
  type?: string | null;
  contentRating?: string | null;
}

type TrpcResult = { result?: { data?: { json?: unknown } }; error?: unknown }[];

const UNDEFINED = ['undefined'];

export abstract class Hiper {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;
  mangaPath = 'manga';
  genresList: string[] = [];
  extraHeaders: Record<string, string> = {};
  private cookie: string | null = null;

  headers(): Record<string, string> {
    return {
      'User-Agent': this.userAgent,
      Referer: `${this.baseUrl}/`,
      ...this.extraHeaders,
      ...(this.cookie ? { Cookie: this.cookie } : {}),
    };
  }

  async refreshCookie(): Promise<void> {
    const response = await http.get(`${this.baseUrl}/`, {
      headers: {
        'User-Agent': this.userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    const header = Object.entries(response.headers).find(([name]) => name.toLowerCase() === 'set-cookie')?.[1] ?? '';
    const cookies = [...header.matchAll(/(?:^|[,\n]\s*)([\w-]+)=([^;,\n]*)/g)].map((m) => `${m[1]}=${m[2]}`);
    this.cookie = cookies.join('; ') || null;
  }

  async trpc(procedures: string, input: unknown): Promise<TrpcResult> {
    const url = `${this.baseUrl}/api/trpc/${procedures}?batch=1&input=${encodeURIComponent(JSON.stringify(input))}`;
    if (!this.cookie) await this.refreshCookie();
    try {
      return (await http.get<TrpcResult>(url, { headers: this.headers(), responseType: 'json' })).body;
    } catch (error) {
      if (!String(error).includes('401')) throw error;
      await this.refreshCookie();
      return (await http.get<TrpcResult>(url, { headers: this.headers(), responseType: 'json' })).body;
    }
  }

  toSummary(m: MangaDto): MangaSummary {
    return {
      url: `/${this.mangaPath}/${m.slug}`,
      title: this.cleanTitle(m.title, true),
      thumbnailUrl: m.coverUrl || undefined,
    };
  }

  /** Hook for title clean-up preferences (`browsing` is true in lists). */
  cleanTitle(title: string, _browsing: boolean): string {
    return title.trim();
  }

  async query(page: number, query: string, filters: FilterState): Promise<MangaPage> {
    const limit = 30;
    const text = (id: string) => (typeof filters[id] === 'string' && filters[id] ? (filters[id] as string) : null);
    const genres = Object.entries(filters)
      .filter(([id, value]) => id.startsWith('genre.') && value === true)
      .map(([id]) => id.slice('genre.'.length));
    const type = text('type');
    const status = text('status');
    const rating = text('rating');
    const values: Record<string, string[]> = {
      'filters.author': UNDEFINED,
      'filters.artist': UNDEFINED,
      'filters.year': UNDEFINED,
    };
    if (genres.length === 0) values['filters.genres'] = UNDEFINED;
    if (type == null) values['filters.type'] = UNDEFINED;
    if (status == null) values['filters.status'] = UNDEFINED;
    if (rating == null) values['filters.contentRating'] = UNDEFINED;
    const input = {
      0: {
        json: {
          q: query,
          sort: text('sort') ?? 'relevance',
          filters: {
            genres: genres.length ? genres : null,
            type,
            status,
            contentRating: rating,
            author: null,
            artist: null,
            year: null,
          },
          limit,
          offset: (page - 1) * limit,
          maxRating: prefs.get<string>(MAX_RATING_PREFERENCE.key) ?? 'pornographic',
        },
        meta: { values },
      },
    };
    const data = (await this.trpc('search.query', input))[0]?.result?.data?.json as { hits?: MangaDto[] } | undefined;
    const hits = data?.hits ?? [];
    return { items: hits.map((m) => this.toSummary(m)), hasNextPage: hits.length > 0 };
  }

  getPopular(page: number): Promise<MangaPage> {
    return this.query(page, '', { sort: 'popular' });
  }

  getLatest(page: number): Promise<MangaPage> {
    return this.query(page, '', { sort: 'recent' });
  }

  search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    return this.query(page, query.trim(), filters);
  }

  slugOf(url: string): string {
    return url.split(`${this.mangaPath}/`).pop()!.split(/[/#]/)[0] ?? '';
  }

  async fetchManga(slug: string): Promise<MangaDto> {
    const result = await this.trpc('auth.me,series.bySlugWithGenres', {
      0: { json: null, meta: { values: UNDEFINED } },
      1: { json: { slug } },
    });
    const manga = result[result.length - 1]?.result?.data?.json as MangaDto | undefined;
    if (!manga) throw new Error('Series not found');
    return manga;
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const m = await this.fetchManga(this.slugOf(manga.url));
    const statuses: Record<string, MangaStatus> = {
      ongoing: 'ongoing',
      hiatus: 'hiatus',
      cancelled: 'cancelled',
      completed: 'completed',
    };
    const title = this.cleanTitle(m.title, false);
    const description =
      title !== m.title.trim() ? [m.title, m.synopsis].filter(Boolean).join('\n\n') : (m.synopsis ?? '');
    return {
      url: `/${this.mangaPath}/${m.slug}`,
      title,
      description: description || undefined,
      thumbnailUrl: m.coverUrl || manga.thumbnailUrl,
      artist: m.artists?.join(', ') || undefined,
      author: m.authors?.join(', ') || undefined,
      genres: [...(m.genres ?? []), ...[m.type, m.contentRating].filter((v): v is string => Boolean(v))],
      status: statuses[m.status?.toLowerCase() ?? ''] ?? 'unknown',
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const slug = this.slugOf(manga.url);
    const seriesId = (await this.fetchManga(slug)).id;
    const result = await this.trpc('auth.me,series.chapters', {
      0: { json: { values: UNDEFINED } },
      1: {
        json: { seriesId, chapterId: null, sort: 'best', page: 1, limit: 20 },
        meta: { values: { chapterId: UNDEFINED } },
      },
      2: { json: { seriesId } },
    });
    const chapters = (result[result.length - 1]?.result?.data?.json ?? []) as {
      id: number;
      number: number;
      title?: string | null;
      createdAt: string;
    }[];
    return chapters.map((c) => {
      const label = `Chapter ${String(c.number).replace(/\.0$/, '')}`;
      const time = Date.parse(c.createdAt);
      return {
        url: `/${this.mangaPath}/${slug}/${c.number}#${c.id}`,
        name: c.title ? (/\d+/.test(c.title) ? c.title : `${label} ${c.title}`) : label,
        number: c.number,
        uploadedAt: Number.isFinite(time) ? time : undefined,
      };
    });
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const [path = '', chapterId] = chapter.url.split('#');
    const slug = this.slugOf(path);
    const number = Number(path.split('/').pop()) || 1;
    const result = await this.trpc('auth.me,series.bySlug,reader.chapterPages', {
      0: { json: null, meta: { values: UNDEFINED } },
      1: { json: { slug } },
      2: { json: { seriesSlug: slug, chapterNumber: number, ...(chapterId ? { chapterId: Number(chapterId) } : {}) } },
      3: { json: { position: 'footer_bottom' } },
    });
    if (result.some((r) => r.error))
      throw new Error('Cannot load pages (the site may need its web reader for this chapter)');
    const pages = (result[result.length - 1]?.result?.data?.json ?? []) as {
      pageOrder: number;
      webpUrl: string;
      avifUrl?: string | null;
    }[];
    return pages
      .sort((a, b) => a.pageOrder - b.pageOrder)
      .map((p, index) => ({ index, imageUrl: p.avifUrl || p.webpUrl }));
  }

  imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  getFilters(): Filter[] {
    const all = { label: 'All', value: '' };
    const filters: Filter[] = [
      {
        type: 'select',
        id: 'sort',
        label: 'Sort By',
        options: [
          { label: 'Relevance', value: 'relevance' },
          { label: 'Popularity', value: 'popular' },
          { label: 'Score', value: 'score' },
          { label: 'Recent Updated', value: 'recent' },
          { label: 'Newest', value: 'newest' },
          { label: 'Oldest', value: 'oldest' },
          { label: 'A-Z', value: 'alphabetical' },
        ],
      },
      { type: 'select', id: 'rating', label: 'Rating', options: [all, ...RATINGS] },
      {
        type: 'select',
        id: 'type',
        label: 'Type',
        options: [
          all,
          ...['Manga', 'Manhwa', 'Manhua', 'Novel', 'Webtoon'].map((t) => ({ label: t, value: t.toLowerCase() })),
          { label: 'One Shot', value: 'one_shot' },
        ],
      },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [
          all,
          { label: 'Ongoing', value: 'ongoing' },
          { label: 'Completed', value: 'completed' },
          { label: 'Hiatus', value: 'hiatus' },
          { label: 'Canceled', value: 'cancelled' },
        ],
      },
    ];
    if (this.genresList.length > 0)
      filters.push({
        type: 'group',
        id: 'genre',
        label: 'Genres',
        filters: this.genresList.map((g) => ({ type: 'checkbox', id: `genre.${g}`, label: g })),
      });
    return filters;
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/([^/?#]+)\/([^/?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl) || match[2] !== this.mangaPath) return null;
    return { url: `/${this.mangaPath}/${match[3]}`, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return `${this.baseUrl}${item.url.split('#')[0]}`;
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
