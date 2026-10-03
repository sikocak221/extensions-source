// HeanCMS (JSON API), ported from keiyoushi/extensions-source lib-multisrc/heancms. This directory is a
// template: every extension using the theme keeps an identical copy in src/heancms/
// (`node scripts/sync-multisrc.mjs`).
//
// Manga urls are "/<sub dir>/<slug>", chapter urls "/<sub dir>/<slug>/<chapter slug>#<id>".
import type {
  Chapter,
  Filter,
  FilterState,
  MangaDetails,
  MangaPage,
  MangaStatus,
  MangaSummary,
  Page,
  Preference,
  Source,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, htmlToText, withQuery } from './utils';

export const SHOW_PAID_CHAPTERS_PREFERENCE: Preference = {
  type: 'switch',
  key: 'pref_show_paid_chap',
  label: 'Display paid chapters',
  description: 'Paid chapters only load when bought (and logged in).',
  default: false,
};

export const LOGIN_PREFERENCES: Preference[] = [
  { type: 'text', key: 'pref_user', label: 'Username/Email', description: 'Ignored if empty.', default: '' },
  {
    type: 'text',
    key: 'pref_password',
    label: 'Password',
    description: 'Ignored if empty. Stored as plain text.',
    default: '',
  },
];

const ACCEPT_JSON = 'application/json, text/plain, */*';

interface SeriesDto {
  id: number;
  series_slug: string;
  author?: string | null;
  description?: string | null;
  studio?: string | null;
  status?: string | null;
  thumbnail: string;
  title: string;
  tags?: { name: string }[] | null;
}

export abstract class HeanCms {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;
  enableLogin = false;
  coverPath = '';
  mangaSubDirectory = 'series';
  latestSortBy = 'desc';
  private token: { value: string; user: string; expires: number } | null = null;

  get apiUrl(): string {
    return this.baseUrl.replace('://', '://api.');
  }

  get cdnUrl(): string {
    return this.apiUrl;
  }

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/`, Origin: this.baseUrl, Accept: ACCEPT_JSON };
  }

  async api<T>(url: string, headers = this.headers()): Promise<T> {
    return (await http.get<T>(url, { headers, responseType: 'json' })).body;
  }

  async authHeaders(): Promise<Record<string, string>> {
    const user = prefs.get<string>('pref_user')?.trim() ?? '';
    const password = prefs.get<string>('pref_password') ?? '';
    if (!this.enableLogin || !user || !password) return this.headers();
    if (!this.token || this.token.user !== user || Date.now() > this.token.expires) {
      let body: { token?: string; expiresAt?: string };
      try {
        body = (
          await http.post<{ token?: string; expiresAt?: string }>(
            `${this.apiUrl}/login`,
            { form: { email: user, password } },
            { headers: this.headers(), responseType: 'json' },
          )
        ).body;
      } catch (error) {
        throw new Error(`Login failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!body.token) throw new Error('Unknown error occurred while logging in');
      const expires = Date.parse(body.expiresAt ?? '');
      this.token = {
        value: body.token,
        user,
        expires: (Number.isFinite(expires) ? expires : Date.now() + 86_400_000 * 2) - 86_400_000,
      };
    }
    return { ...this.headers(), Authorization: `Bearer ${this.token.value}` };
  }

  absolute(path: string): string {
    return /^https?:\/\//.test(path) ? path : `${this.cdnUrl}/${this.coverPath}${path}`;
  }

  queryUrl(page: number, query: string, status: string, order: string, orderBy: string, tagIds: string): string {
    return withQuery(`${this.apiUrl}/query`, {
      query_string: query,
      status,
      order,
      orderBy,
      series_type: 'Comic',
      page: String(page),
      perPage: '12',
      tags_ids: tagIds,
      adult: 'true',
    });
  }

  async seriesList(url: string): Promise<MangaPage> {
    const data = await this.api<{ data?: SeriesDto[]; meta?: { current_page: number; last_page: number } | null }>(url);
    return {
      items: (data.data ?? []).map((s) => ({
        url: `/${this.mangaSubDirectory}/${s.series_slug}`,
        title: s.title,
        thumbnailUrl: s.thumbnail ? this.absolute(s.thumbnail) : undefined,
      })),
      hasNextPage: data.meta ? data.meta.current_page < data.meta.last_page : false,
    };
  }

  getPopular(page: number): Promise<MangaPage> {
    return this.seriesList(this.queryUrl(page, '', 'All', 'desc', 'total_views', '[]'));
  }

  getLatest(page: number): Promise<MangaPage> {
    return this.seriesList(this.queryUrl(page, '', 'All', this.latestSortBy, 'latest', '[]'));
  }

  search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const sort = typeof filters.sort === 'object' ? filters.sort : null;
    const tags = Object.entries(filters)
      .filter(([id, value]) => id.startsWith('genre.') && value === true)
      .map(([id]) => id.slice('genre.'.length));
    return this.seriesList(
      this.queryUrl(
        page,
        query.trim(),
        typeof filters.status === 'string' && filters.status ? filters.status : 'All',
        sort?.ascending ? 'asc' : 'desc',
        sort?.value || 'total_views',
        `[${tags.join(',')}]`,
      ),
    );
  }

  slugOf(url: string): string {
    return url.split('#')[0]!.split('/').filter(Boolean).pop() ?? '';
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const s = await this.api<SeriesDto>(`${this.apiUrl}/series/${this.slugOf(manga.url)}`);
    const statuses: Record<string, MangaStatus> = {
      Ongoing: 'ongoing',
      Hiatus: 'hiatus',
      Dropped: 'cancelled',
      Completed: 'completed',
      Finished: 'completed',
    };
    let description: string | undefined;
    if (s.description) {
      const paragraphs = html
        .load(s.description)
        .select('p')
        .map((p) => p.text());
      description = paragraphs.length > 0 ? paragraphs.join('\n\n') : htmlToText(s.description);
    }
    return {
      url: `/${this.mangaSubDirectory}/${s.series_slug}`,
      title: s.title,
      author: s.author?.trim() || undefined,
      artist: s.studio?.trim() || undefined,
      description: description || undefined,
      genres: (s.tags ?? []).map((t) => t.name).sort(),
      thumbnailUrl: s.thumbnail ? this.absolute(s.thumbnail) : manga.thumbnailUrl,
      status: statuses[s.status ?? ''] ?? 'unknown',
      type: 'manhwa',
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const slug = this.slugOf(manga.url);
    let seriesId = manga.url.split('#')[1];
    if (!seriesId) seriesId = String((await this.api<SeriesDto>(`${this.apiUrl}/series/${slug}`)).id);
    const showPaid = prefs.get<boolean>(SHOW_PAID_CHAPTERS_PREFERENCE.key) === true;
    const now = Date.now();
    const chapters: Chapter[] = [];
    for (let page = 1, more = true; more; page++) {
      const data = await this.api<{
        data: {
          id: number;
          chapter_name: string;
          chapter_title?: string | null;
          chapter_slug: string;
          created_at?: string | null;
          price?: number | null;
        }[];
        meta: { current_page: number; last_page: number };
      }>(withQuery(`${this.apiUrl}/chapter/query`, { page: String(page), perPage: '1000', series_id: seriesId }));
      more = data.meta.current_page < data.meta.last_page;
      for (const c of data.data) {
        if (c.price && !showPaid) continue;
        const time = c.created_at ? Date.parse(c.created_at) : Number.NaN;
        if (Number.isFinite(time) && time > now) continue;
        chapters.push({
          url: `/${this.mangaSubDirectory}/${slug}/${c.chapter_slug}#${c.id}`,
          name: `${c.chapter_name.trim()}${c.chapter_title ? ` - ${c.chapter_title.trim()}` : ''}${c.price ? ' 🔒' : ''}`,
          uploadedAt: Number.isFinite(time) ? time : undefined,
        });
      }
    }
    return chapters;
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const path = chapter.url.split('#')[0]!.replace(`/${this.mangaSubDirectory}/`, '/chapter/');
    const data = await this.api<{ chapter: { chapter_data?: { images?: string[] | null } | null }; paywall?: boolean }>(
      `${this.apiUrl}${path}`,
      await this.authHeaders(),
    );
    if (data.paywall && !data.chapter.chapter_data) throw new Error('Paid chapter unavailable.');
    return (data.chapter.chapter_data?.images ?? []).map((image, index) => ({ index, imageUrl: this.absolute(image) }));
  }

  imageHeaders(): Record<string, string> {
    return {
      'User-Agent': this.userAgent,
      Referer: `${this.baseUrl}/`,
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    };
  }

  async getFilters(): Promise<Filter[]> {
    const filters: Filter[] = [
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [
          { label: 'All', value: 'All' },
          { label: 'Ongoing', value: 'Ongoing' },
          { label: 'On hiatus', value: 'Hiatus' },
          { label: 'Dropped', value: 'Dropped' },
          { label: 'Completed', value: 'Completed' },
          { label: 'Canceled', value: 'Canceled' },
        ],
      },
      {
        type: 'sort',
        id: 'sort',
        label: 'Sort By',
        options: [
          { label: 'Title', value: 'title' },
          { label: 'Views', value: 'total_views' },
          { label: 'Latest', value: 'latest' },
          { label: 'Created at', value: 'created_at' },
        ],
        default: { value: 'total_views', ascending: false },
      },
    ];
    try {
      const genres = await this.api<{ id: number; name: string }[]>(`${this.apiUrl}/tags`);
      if (genres.length > 0)
        filters.push({
          type: 'group',
          id: 'genre',
          label: 'Genres',
          filters: genres.map((g) => ({ type: 'checkbox', id: `genre.${g.id}`, label: g.name })),
        });
    } catch (error) {
      log.warn('Cannot load genres', error);
    }
    return filters;
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/([^/?#]+)\/([^/?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl) || match[2] !== this.mangaSubDirectory) return null;
    return { url: `/${this.mangaSubDirectory}/${match[3]}`, title: '' };
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
