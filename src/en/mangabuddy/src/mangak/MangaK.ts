// MangaK (JSON API + Next.js pages), ported from keiyoushi/extensions-source lib-multisrc/mangak. This
// directory is a template: every extension using the theme keeps an identical copy in src/mangak/
// (`node scripts/sync-multisrc.mjs`).
//
// Manga urls are the site's own path (the api id is looked up from the page).
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
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl, withQuery } from './utils';

interface InitialManga {
  id: string;
  name: string;
  authors?: { name: string }[] | null;
  summary?: string | null;
  genres?: { name: string }[] | null;
  status?: string | null;
  cover?: string | null;
  url?: string | null;
}

const option = (label: string, value: string): FilterOption => ({ label, value });

export abstract class MangaK {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;

  get apiUrl(): string {
    return `https://api.${hostOf(this.baseUrl)}`;
  }

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  async searchApi(params: Record<string, string | undefined>): Promise<MangaPage> {
    const data = (
      await http.get<{
        data?: {
          items?: { id: string; name: string; cover: string; url: string }[];
          pagination?: { has_next?: boolean };
        };
      }>(withQuery(`${this.apiUrl}/titles/search`, params), { headers: this.headers(), responseType: 'json' })
    ).body.data;
    return {
      items: (data?.items ?? []).map((m) => ({
        url: relativeUrl(m.url),
        title: m.name,
        thumbnailUrl: m.cover,
      })),
      hasNextPage: data?.pagination?.has_next ?? false,
    };
  }

  getPopular(page: number): Promise<MangaPage> {
    return this.searchApi({ sort: 'popular', window: 'week', page: String(page), limit: '24' });
  }

  getLatest(page: number): Promise<MangaPage> {
    return this.searchApi({ sort: 'latest', page: String(page), limit: '24' });
  }

  search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string).trim() : '');
    const genres = (state: string) =>
      Object.entries(filters)
        .filter(([id, value]) => id.startsWith('genre.') && value === state)
        .map(([id]) => id.slice('genre.'.length))
        .join(',');
    const q = query
      .replace(/[^\p{L}\p{N} ]/gu, '')
      .trim()
      .slice(0, 50);
    return this.searchApi({
      page: String(page),
      limit: '24',
      q: q || undefined,
      sort: text('sort') || undefined,
      content_rating: text('content_rating') || undefined,
      status: text('status') || undefined,
      type: text('type') || undefined,
      demographic: text('demographic') || undefined,
      author: text('author') || undefined,
      min_ch: text('min_ch') || undefined,
      genres: genres('include') || undefined,
      exclude: genres('exclude') || undefined,
    });
  }

  /** The Next.js page props of a page. */
  async pageProps(url: string): Promise<{ initialManga?: InitialManga; initialChapter?: { images: string[] } }> {
    const body = (await http.get(url, { headers: this.headers() })).body;
    const json = html.load(body).selectFirst('script#__NEXT_DATA__')?.html();
    if (!json) throw new Error(`Could not extract Next.js data for: ${url}`);
    return (JSON.parse(json) as { props?: { pageProps?: object } }).props?.pageProps ?? {};
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const m = (await this.pageProps(absoluteUrl(this.baseUrl, manga.url.split('#')[0]!))).initialManga;
    if (!m) throw new Error('Could not find manga details');
    const statuses: Record<string, MangaStatus> = {
      ongoing: 'ongoing',
      completed: 'completed',
      hiatus: 'hiatus',
      cancelled: 'cancelled',
    };
    return {
      url: manga.url,
      title: m.name,
      author: m.authors?.map((a) => a.name).join(', ') || undefined,
      description: m.summary || undefined,
      genres: m.genres?.map((g) => g.name),
      status: statuses[m.status?.toLowerCase() ?? ''] ?? 'unknown',
      thumbnailUrl: m.cover || manga.thumbnailUrl,
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    let id = manga.url.split('#')[1];
    if (!id) id = (await this.pageProps(absoluteUrl(this.baseUrl, manga.url))).initialManga?.id;
    if (!id) throw new Error('Could not find manga id');
    const data = (
      await http.get<{
        data?: {
          chapters?: { url: string; name: string; updated_at?: string | null; chapter_number?: number | null }[];
        };
      }>(`${this.apiUrl}/titles/${id}/chapters`, { headers: this.headers(), responseType: 'json' })
    ).body.data;
    return (data?.chapters ?? [])
      .sort((a, b) => (b.chapter_number ?? 0) - (a.chapter_number ?? 0))
      .map((c) => {
        const time = c.updated_at ? Date.parse(c.updated_at) : Number.NaN;
        return {
          url: relativeUrl(c.url),
          name: c.name,
          number: c.chapter_number ?? undefined,
          uploadedAt: Number.isFinite(time) ? time : undefined,
        };
      });
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const images = (await this.pageProps(absoluteUrl(this.baseUrl, chapter.url))).initialChapter?.images ?? [];
    return images.map((imageUrl, index) => ({ index, imageUrl }));
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  async getFilters(): Promise<Filter[]> {
    const filters: Filter[] = [
      {
        type: 'select',
        id: 'sort',
        label: 'Sort By',
        options: [
          option('Best Match', ''),
          option('Most Followed', 'popular'),
          option('Latest Updated', 'latest'),
          option('Recently Added', 'newest'),
          option('Highest Rating', 'rating'),
          option('Most Viewed: Today', 'views_today'),
          option('Most Viewed: 7 Days', 'views_7days'),
          option('Most Viewed: 30 Days', 'views_30days'),
          option('Most Viewed: All Time', 'views'),
          option('Most Chapters', 'chapters'),
          option('A-Z', 'alphabetical'),
        ],
      },
      {
        type: 'select',
        id: 'content_rating',
        label: 'Content Rating',
        options: [
          option('Any', ''),
          option('Safe', 'safe'),
          option('Suggestive', 'suggestive'),
          option('Erotica', 'erotica'),
          option('Pornographic', 'pornographic'),
        ],
      },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [
          option('Any', ''),
          option('Ongoing', 'ongoing'),
          option('Completed', 'completed'),
          option('Hiatus', 'hiatus'),
          option('Cancelled', 'cancelled'),
        ],
      },
      {
        type: 'select',
        id: 'type',
        label: 'Type',
        options: [option('Any', ''), option('Manga', 'manga'), option('Manhwa', 'manhwa'), option('Manhua', 'manhua')],
      },
      {
        type: 'select',
        id: 'demographic',
        label: 'Demographics',
        options: [
          option('Any', ''),
          option('Boy (Shounen + Seinen)', 'shounen,seinen'),
          option('Girl (Shoujo + Josei)', 'shoujo,josei'),
          option('Shounen', 'shounen'),
          option('Shoujo', 'shoujo'),
          option('Seinen', 'seinen'),
          option('Josei', 'josei'),
        ],
      },
      { type: 'separator' },
      { type: 'text', id: 'author', label: 'Author' },
      { type: 'text', id: 'min_ch', label: 'Min Chapters' },
    ];
    try {
      const data = (
        await http.get<{ data?: { items?: { name: string; slug: string }[] } }>(`${this.apiUrl}/genres`, {
          headers: this.headers(),
          responseType: 'json',
        })
      ).body;
      const genres = data.data?.items ?? [];
      if (genres.length > 0) {
        filters.push(
          { type: 'separator' },
          {
            type: 'group',
            id: 'genre',
            label: 'Genres',
            filters: genres.map((g) => ({ type: 'tristate', id: `genre.${g.slug}`, label: g.name })),
          },
        );
      }
    } catch (error) {
      log.warn('Cannot load genres', error);
    }
    return filters;
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)(\/[^?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase().replace(/^www\./, '') !== hostOf(this.baseUrl).replace(/^www\./, ''))
      return null;
    return { url: match[2]!, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return absoluteUrl(this.baseUrl, item.url.split('#')[0]!);
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
