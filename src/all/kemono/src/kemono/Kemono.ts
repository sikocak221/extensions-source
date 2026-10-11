// Kemono (creator archive), ported from keiyoushi/extensions-source lib-multisrc/kemono. This directory is a
// template: every extension using the theme keeps an identical copy in src/kemono/
// (`node scripts/sync-multisrc.mjs`).
//
// Manga urls are "/<service>/user/<id>" (a creator), chapter urls "/<service>/user/<id>/post/<post id>".
// Unlike Tachiyomi, the fallback of full-size files to the thumbnail server needs an image interceptor, which the
// sandbox does not have: turn on "Use low resolution images" when the file servers are unreachable.
import type {
  Chapter,
  Filter,
  FilterState,
  MangaDetails,
  MangaPage,
  MangaSummary,
  Page,
  Preference,
  Source,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf } from './utils';

const API_PATH = 'api/v1';
const DATA_PATH = 'data';
const PAGE_POST_LIMIT = 50;
const PAGE_CREATORS_LIMIT = 50;
const POST_PAGES_MAX = 75;
const PROMPT = 'You can change how many posts to load in the extension preferences.';

export const POST_PAGES_PREFERENCE: Preference = {
  type: 'select',
  key: 'POST_PAGES',
  label: 'Maximum posts to load',
  description: 'Loading more posts costs more time and network traffic.',
  default: '1',
  options: Array.from({ length: POST_PAGES_MAX }, (_, i) => ({
    label: `${i + 1} pages (${(i + 1) * PAGE_POST_LIMIT} posts)`,
    value: String(i + 1),
  })),
};

export const LOW_RES_PREFERENCE: Preference = {
  type: 'switch',
  key: 'USE_LOW_RES_IMG',
  label: 'Use low resolution images',
  description: 'Reduce load time significantly.',
  default: false,
};

interface CreatorDto {
  id: string;
  name: string;
  service: string;
  updated: string | number;
  favorited?: number;
}

interface FavoriteDto {
  id: string;
  service: string;
  faved_seq: number;
}

interface PostDto {
  id: string;
  service: string;
  user: string;
  title: string;
  added?: string | null;
  published?: string | null;
  edited?: string | null;
  file?: { name?: string | null; path?: string | null } | null;
  attachments?: { name?: string | null; path: string }[] | null;
}

const SORTS = [
  { label: 'Popularity', value: 'pop' },
  { label: 'Date Indexed', value: 'new' },
  { label: 'Date Updated', value: 'lat' },
  { label: 'Alphabetical Order', value: 'tit' },
  { label: 'Service', value: 'serv' },
  { label: 'Date Favorited', value: 'fav' },
];

function serviceName(service: string): string {
  switch (service) {
    case 'fanbox':
      return 'Pixiv Fanbox';
    case 'subscribestar':
      return 'SubscribeStar';
    case 'dlsite':
      return 'DLsite';
    case 'onlyfans':
      return 'OnlyFans';
    default:
      return service.charAt(0).toUpperCase() + service.slice(1);
  }
}

/** ISO local date-time ("2024-01-31T12:00:00[.123]") in the given UTC offset (hours) to a timestamp. */
function parseLocalDateTime(value: string | null | undefined, offsetHours: number): number | undefined {
  if (!value) return undefined;
  const time = Date.parse(`${value.replace(/Z$/, '').split('+')[0]}Z`);
  return Number.isFinite(time) ? time - offsetHours * 3_600_000 : undefined;
}

export abstract class Kemono {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;
  /** Service names offered by the "Types" filter. */
  types: string[] = [];

  private creators: CreatorDto[] | null = null;

  get imgCdnUrl(): string {
    return this.baseUrl.replace('//', '//img.');
  }

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  /** The API answers only to "Accept: text/css" (DDoS-Guard). */
  apiHeaders(): Record<string, string> {
    return { ...this.headers(), Accept: 'text/css' };
  }

  async api<T>(path: string): Promise<T> {
    const response = await http.request<string>({
      url: `${this.baseUrl}/${API_PATH}${path}`,
      method: 'GET',
      headers: this.apiHeaders(),
    });
    if (response.status < 200 || response.status >= 300) throw new HttpError(response.status);
    return JSON.parse(response.body) as T;
  }

  // Listing: the whole creator list is downloaded, then filtered and sorted locally.
  getPopular(page: number): Promise<MangaPage> {
    return this.searchCreators(page, '', { value: 'pop', ascending: false });
  }

  getLatest(page: number): Promise<MangaPage> {
    return this.searchCreators(page, '', { value: 'lat', ascending: false });
  }

  search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const sortFilter = filters.sort;
    const sort = sortFilter && typeof sortFilter === 'object' ? sortFilter : { value: 'pop', ascending: false };
    return this.searchCreators(page, query, sort, filters);
  }

  async allCreators(): Promise<CreatorDto[]> {
    if (!this.creators) {
      this.creators = (await this.api<CreatorDto[]>('/creators')).filter((c) => c.service.toLowerCase() !== 'discord');
      await timers.sleep(0);
    }
    return this.creators;
  }

  updatedOf(c: CreatorDto): number {
    return typeof c.updated === 'string' ? (parseLocalDateTime(c.updated, 0) ?? 0) : Math.floor(c.updated * 1000);
  }

  async searchCreators(
    page: number,
    title: string,
    sort: { value: string; ascending: boolean },
    filters: FilterState = {},
  ): Promise<MangaPage> {
    const included: string[] = [];
    const excluded: string[] = [];
    for (const type of this.types) {
      const state = filters[`type.${type.toLowerCase()}`];
      if (state === 'include') included.push(type.toLowerCase());
      else if (state === 'exclude') excluded.push(type.toLowerCase());
    }
    const favState = filters['fav.only'];
    const favoritesOnly = favState === 'include' ? true : favState === 'exclude' ? false : null;

    const favSeq = new Map<string, number>();
    if (favoritesOnly !== null) {
      const response = await http.request<string>({
        url: `${this.baseUrl}/${API_PATH}/account/favorites`,
        method: 'GET',
        headers: this.apiHeaders(),
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(
          `Failed to fetch favorites: ${response.status === 401 ? 'You are not logged in' : `HTTP error ${response.status}`}`,
        );
      }
      for (const f of JSON.parse(response.body) as FavoriteDto[]) {
        if (f.service.toLowerCase() !== 'discord') favSeq.set(f.id, f.faved_seq);
      }
    }

    const all = await this.allCreators();
    const needle = title.toLowerCase();
    const matched = all.filter((c) => {
      const type = serviceName(c.service).toLowerCase();
      if (included.length > 0 && !included.includes(type)) return false;
      if (excluded.length > 0 && excluded.includes(type)) return false;
      if (favoritesOnly === true && !favSeq.has(c.id)) return false;
      if (favoritesOnly === false && favSeq.has(c.id)) return false;
      return c.name.toLowerCase().includes(needle);
    });
    await timers.sleep(0);

    const dir = sort.ascending ? 1 : -1;
    const key = (c: CreatorDto): number | string => {
      switch (sort.value) {
        case 'pop':
          return c.favorited ?? -1;
        case 'tit':
          return c.name;
        case 'new':
          return c.id;
        case 'fav':
          return favSeq.get(c.id) ?? 0;
        case 'serv':
          return c.service;
        default:
          return this.updatedOf(c);
      }
    };
    if (sort.value === 'fav' && favoritesOnly !== true) throw new Error("Please check 'Favorites Only' Filter");
    const sorted = matched
      .map((c) => ({ c, k: key(c) }))
      .sort((a, b) => (a.k < b.k ? -dir : a.k > b.k ? dir : 0))
      .map(({ c }) => c);

    const from = (page - 1) * PAGE_CREATORS_LIMIT;
    const to = Math.min(sorted.length, from + PAGE_CREATORS_LIMIT);
    return { items: sorted.slice(from, to).map((c) => this.toSummary(c)), hasNextPage: to !== sorted.length };
  }

  toSummary(c: CreatorDto): MangaSummary {
    return {
      url: `/${c.service}/user/${c.id}`,
      title: c.name,
      thumbnailUrl: `${this.imgCdnUrl}/icons/${c.service}/${c.id}`,
    };
  }

  // Details: the creator is the manga, its posts are the chapters.
  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const service = manga.url.split('/')[1] ?? '';
    return { ...manga, author: serviceName(service), description: PROMPT, status: 'unknown' };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const service = manga.url.split('/')[1] ?? '';
    const offsetHours = service === 'fanbox' || service === 'fantia' ? 9 : 0;
    const maxPages = Number(prefs.get<string>(POST_PAGES_PREFERENCE.key) ?? '1') || 1;
    const limit = Math.min(maxPages, POST_PAGES_MAX) * PAGE_POST_LIMIT;
    const result: Chapter[] = [];
    let offset = 0;
    let hasNextPage = true;
    while (offset < limit && hasNextPage) {
      const page = await this.retry<PostDto[]>(`${manga.url}/posts?o=${offset}`);
      for (const post of page) if (this.images(post).length > 0) result.push(this.toChapter(post, offsetHours));
      offset += PAGE_POST_LIMIT;
      hasNextPage = page.length === PAGE_POST_LIMIT;
    }
    return result;
  }

  async retry<T>(path: string): Promise<T> {
    let code = 0;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.api<T>(path);
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        code = error.status;
        if (code === 429) await timers.sleep(10_000);
      }
    }
    throw new Error(`HTTP error ${code}`);
  }

  images(post: PostDto): string[] {
    const files = [
      ...(post.file?.path ? [{ name: post.file.name, path: post.file.path }] : []),
      ...(post.attachments ?? []),
    ];
    const seen = new Set<string>();
    return files
      .filter((f) => ['png', 'jpg', 'gif', 'jpeg', 'webp'].includes(f.path.split('.').pop()?.toLowerCase() ?? ''))
      .filter((f) => !seen.has(f.path) && seen.add(f.path))
      .map((f) => f.path + (f.name ? `?f=${f.name}` : ''));
  }

  toChapter(post: PostDto, offsetHours: number): Chapter {
    const date = parseLocalDateTime(post.edited ?? post.published ?? post.added, offsetHours);
    const stamp = date ? new Date(date).toISOString().replace('T', ' at ').slice(0, 22) : 'unknown date';
    return {
      url: `/${post.service}/user/${post.user}/post/${post.id}`,
      name: post.title.trim() ? post.title : `Post from ${stamp}`,
      number: -2,
      uploadedAt: date,
    };
  }

  // Pages
  async getPages(chapter: Chapter): Promise<Page[]> {
    const data = await this.api<{ post: PostDto }>(chapter.url);
    const lowRes = prefs.get<boolean>(LOW_RES_PREFERENCE.key) === true;
    return this.images(data.post).map((path, index) => ({
      index,
      imageUrl: `${this.baseUrl}${lowRes ? '/thumbnail' : ''}/${DATA_PATH}${path}`,
    }));
  }

  /** Full-size files redirect to the nX file servers; the thumbnail server answers when they are down. */
  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  // Filters
  getFilters(): Filter[] {
    return [
      { type: 'sort', id: 'sort', label: 'Sort by', options: SORTS, default: { value: 'pop', ascending: false } },
      {
        type: 'group',
        id: 'type',
        label: 'Types',
        filters: this.types.map((t) => ({ type: 'tristate', id: `type.${t.toLowerCase()}`, label: t })),
      },
      {
        type: 'group',
        id: 'fav',
        label: 'Favorites',
        filters: [{ type: 'tristate', id: 'fav.only', label: 'Favorites Only' }],
      },
    ];
  }

  // URLs
  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/([^/?#]+)\/user\/([^/?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: `/${match[2]}/user/${match[3]}`, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return `${this.baseUrl}${item.url}`;
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

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP error ${status}`);
  }
}
