import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://pawchive.pw';
const FILE_URL = 'https://file.pawchive.pw';
const IMG_URL = 'https://img.pawchive.pw';
const API = `${BASE_URL}/api/v1`;
const PAGE_SIZE = 50;
const PROMPT = 'You can change how many posts to load in the extension preferences.';
const IMAGE_EXTENSIONS = ['png', 'jpg', 'gif', 'jpeg', 'webp'];

const apiHeaders = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, Accept: 'text/css' };

interface Creator {
  id: string;
  name: string;
  service: string;
  updated: string | number;
  favorited?: number;
}
interface Post {
  id: string;
  service: string;
  user: string;
  title: string;
  added?: string | null;
  published?: string | null;
  edited?: string | null;
  file?: { path?: string } | null;
  attachments?: { path?: string }[];
}

const serviceName = (service: string) =>
  service === 'fanbox' ? 'Pixiv Fanbox' : service.charAt(0).toUpperCase() + service.slice(1);

const updatedDate = (c: Creator) =>
  typeof c.updated === 'string'
    ? Date.parse(c.updated.endsWith('Z') ? c.updated : `${c.updated}Z`) || 0
    : c.updated * 1000;

const postImages = (post: Post): string[] => {
  const paths = [post.file, ...(post.attachments ?? [])]
    .map((f) => f?.path ?? '')
    .filter((p) => p.trim() && IMAGE_EXTENSIONS.includes(p.split('.').pop()!.toLowerCase()));
  return [...new Set(paths)];
};

let creatorsCache: { at: number; list: Creator[] } | undefined;

async function creators(): Promise<Creator[]> {
  if (creatorsCache && Date.now() - creatorsCache.at < 30 * 60_000) return creatorsCache.list;
  const response = await http.get<Creator[]>(`${API}/creators`, { headers: apiHeaders, responseType: 'json' });
  creatorsCache = { at: Date.now(), list: response.body };
  return response.body;
}

const toSummary = (c: Creator): MangaSummary => ({
  url: `/${c.service}/user/${c.id}`,
  title: c.name,
  thumbnailUrl: `${BASE_URL}/icons/${c.service}/${c.id}`,
});

const toThumbnail = (url: string) => `${IMG_URL}/thumbnail${url.replace(/^https?:\/\/[^/]+/, '')}`;

export default defineExtension({
  preferences: () => [
    {
      type: 'select',
      key: 'POST_PAGES',
      label: 'Maximum posts to load',
      description: 'Loading more posts costs more time and network traffic.',
      options: Array.from({ length: 75 }, (_, i) => ({
        label: `${i + 1} pages (${(i + 1) * PAGE_SIZE} posts)`,
        value: String(i + 1),
      })),
      default: '1',
    },
    {
      type: 'select',
      key: 'POST_DATE_PREF',
      label: 'Preferred Post Date',
      options: [
        { label: 'Added Date', value: 'added' },
        { label: 'Published Date', value: 'published' },
        { label: 'Edited Date', value: 'edited' },
      ],
      default: 'published',
    },
    {
      type: 'switch',
      key: 'USE_LOW_RES_IMG',
      label: 'Use low resolution images',
      description: 'Reduce load time significantly.',
      default: false,
    },
  ],

  createSource: () => {
    async function browse(page: number, query: string, state: FilterState, defaultSort: string): Promise<MangaPage> {
      const sortState =
        state.sort && typeof state.sort === 'object' ? state.sort : { value: defaultSort, ascending: false };
      const included = ['patreon', 'fanbox'].filter((s) => state[`type:${s}`] === 'include');
      const excluded = ['patreon', 'fanbox'].filter((s) => state[`type:${s}`] === 'exclude');
      const q = query.toLowerCase();
      const filtered = (await creators()).filter((c) => {
        const name = serviceName(c.service).toLowerCase();
        const type = name === 'pixiv fanbox' ? 'pixiv fanbox' : name;
        const inc = included.length === 0 || included.some((s) => type.includes(s === 'fanbox' ? 'fanbox' : s));
        const exc = excluded.some((s) => type.includes(s === 'fanbox' ? 'fanbox' : s));
        return inc && !exc && c.name.toLowerCase().includes(q);
      });
      const dir = sortState.ascending ? 1 : -1;
      const key = (c: Creator): number | string =>
        sortState.value === 'pop'
          ? (c.favorited ?? 0)
          : sortState.value === 'tit'
            ? c.name.toLowerCase()
            : sortState.value === 'new'
              ? Number.parseInt(c.id, 10) || 0
              : updatedDate(c);
      const sorted = [...filtered].sort((a, b) => {
        const x = key(a);
        const y = key(b);
        return x < y ? -dir : x > y ? dir : 0;
      });
      const start = (page - 1) * PAGE_SIZE;
      return {
        items: sorted.slice(start, start + PAGE_SIZE).map(toSummary),
        hasNextPage: start + PAGE_SIZE < sorted.length,
      };
    }

    return {
      baseUrl: BASE_URL,

      getPopular: (page: number) => browse(page, '', {}, 'pop'),

      getLatest: (page: number) => browse(page, '', {}, 'lat'),

      search: (query: string, page: number, state: FilterState) => browse(page, query, state, 'pop'),

      getFilters(): Filter[] {
        return [
          {
            type: 'sort',
            id: 'sort',
            label: 'Sort by',
            options: [
              { label: 'Popularity', value: 'pop' },
              { label: 'Date Indexed', value: 'new' },
              { label: 'Date Updated', value: 'lat' },
              { label: 'Alphabetical Order', value: 'tit' },
            ],
            default: { value: 'pop', ascending: false },
          },
          {
            type: 'group',
            id: 'type',
            label: 'Types',
            filters: [
              { type: 'tristate', id: 'type:patreon', label: 'Patreon' },
              { type: 'tristate', id: 'type:fanbox', label: 'Pixiv Fanbox' },
            ],
          },
        ];
      },

      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        const [service, , id] = manga.url.split('/').filter(Boolean) as [string, string, string];
        const creator = (await creators()).find((c) => c.id === id && c.service === service);
        return {
          url: manga.url,
          title: creator?.name ?? manga.title,
          thumbnailUrl: manga.thumbnailUrl,
          author: serviceName(service),
          description: PROMPT,
          status: 'unknown',
        };
      },

      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        const maxPosts = Number.parseInt(prefs.get<string>('POST_PAGES') ?? '1', 10) * PAGE_SIZE;
        const datePref = prefs.get<string>('POST_DATE_PREF') ?? 'published';
        const service = serviceName(manga.url.split('/').filter(Boolean)[0]!);
        const chapters: Chapter[] = [];
        for (let offset = 0, hasNext = true; offset < maxPosts && hasNext; offset += PAGE_SIZE) {
          const response = await http.get<Post[]>(`${API}${manga.url}/posts?o=${offset}`, {
            headers: apiHeaders,
            responseType: 'json',
          });
          for (const post of response.body) {
            if (postImages(post).length === 0) continue;
            const dateStr =
              datePref === 'added'
                ? (post.added ?? post.published ?? post.edited)
                : datePref === 'edited'
                  ? (post.edited ?? post.published ?? post.added)
                  : (post.published ?? post.added ?? post.edited);
            const withZone =
              dateStr && !/(Z|[+-]\d\d:?\d\d)$/.test(dateStr)
                ? `${dateStr}${service === 'Pixiv Fanbox' ? '+09:00' : 'Z'}`
                : dateStr;
            const uploadedAt = withZone ? Date.parse(withZone) || undefined : undefined;
            chapters.push({
              url: `/${post.service}/user/${post.user}/post/${post.id}`,
              name:
                post.title.trim() ||
                `Post from ${dateStr ? dateStr.replace(/[+Z].*$/, '').replace('T', ' at ') : 'unknown date'}`,
              uploadedAt,
            });
          }
          hasNext = response.body.length === PAGE_SIZE;
        }
        // Posts arrive newest first; give each its own chapter number (newest highest).
        return chapters.map((c, i) => ({ ...c, number: chapters.length - i }));
      },

      async getPages(chapter: Chapter): Promise<Page[]> {
        const response = await http.get<Post | { post: Post }>(`${API}${chapter.url}`, {
          headers: apiHeaders,
          responseType: 'json',
        });
        const post = 'post' in response.body ? response.body.post : response.body;
        const low = prefs.get<boolean>('USE_LOW_RES_IMG') === true;
        return postImages(post).map((path, index) => {
          const original = `${FILE_URL}/data${path}`;
          return { index, imageUrl: low ? toThumbnail(original) : original };
        });
      },

      imageHeaders: () => ({
        'User-Agent': USER_AGENT,
        Referer: `${BASE_URL}/`,
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      }),

      resolveUrl(url: string): MangaSummary | null {
        const match = /^https?:\/\/(?:www\.)?pawchive\.pw(\/[a-z]+\/user\/[^/?#]+)/i.exec(url.trim());
        return match ? { url: match[1]!, title: '' } : null;
      },

      getWebUrl: (item) => `${BASE_URL}${item.url}`,
    };
  },
});
