import {
  type Chapter,
  type Filter,
  type MangaPage,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { hostOf, parseDate, withQuery } from './common/utils';

const BASE_URL = 'https://e621.net';
const USER_AGENT = 'E621/1.6 Keiyoushi (https://github.com/keiyoushi/extensions-source)';
const DELETED_PLACEHOLDER = 'https://placehold.co/256x256/cccccc/f66151.jpg?text=Post%20Deleted';
const BLACKLISTED_PLACEHOLDER = 'https://placehold.co/256x256/cccccc/f66151.jpg?text=Post%20Blacklisted';
const NO_IMAGE_PLACEHOLDER = 'https://placehold.co/256x256/cccccc/f66151.jpg?text=No%20Image';
const POOL_PAGE_SIZE = 24;

const PREF_USERNAME = 'usernamePref';
const PREF_API_KEY = 'apiKeyPref';
const PREF_BLACKLIST = 'blacklistPref';
const PREF_FULL_RES = 'fullResolutionPref';

const ORDERS = [
  ['Post count', 'post_count'],
  ['Last updated', 'updated_at'],
  ['Created', 'created_at'],
  ['Name', 'name'],
] as const;
const CATEGORIES = [
  ['All', ''],
  ['Series', 'series'],
  ['Collection', 'collection'],
] as const;

interface Pool {
  id: number;
  name: string;
  description?: string;
  post_ids?: number[];
  is_active?: boolean | null;
  updated_at?: string;
}
interface ImageData {
  url?: string | null;
  has?: boolean;
  width?: number;
  height?: number;
}
interface Post {
  id: number;
  flags?: { deleted?: boolean };
  preview?: ImageData;
  sample?: ImageData;
  file?: ImageData;
  tags?: Record<string, string[]>;
}

const preferences: Preference[] = [
  {
    type: 'text',
    key: PREF_USERNAME,
    label: 'Username',
    description: 'Needed to see your blacklist-free content',
    default: '',
  },
  {
    type: 'text',
    key: PREF_API_KEY,
    label: 'API key',
    description: 'Generate one in your e621 account settings',
    default: '',
  },
  {
    type: 'text',
    key: PREF_BLACKLIST,
    label: 'Blacklisted tags',
    description: 'Space-separated tags; use + to require several tags on one post (a+b)',
    default: '',
  },
  {
    type: 'switch',
    key: PREF_FULL_RES,
    label: 'Full resolution',
    description: 'Always use the original image',
    default: false,
  },
];

const pref = (key: string): string => (prefs.get<string>(key) ?? '').trim();

function apiHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
  const username = pref(PREF_USERNAME);
  const apiKey = pref(PREF_API_KEY);
  if (username && apiKey) headers.Authorization = `Basic ${base64.encode(`${username}:${apiKey}`)}`;
  return headers;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await http.get<T>(url, { headers: apiHeaders(), responseType: 'json' });
  return response.body;
}

const usable = (url: string | null | undefined): string | undefined => (url && url !== 'null' ? url : undefined);

function thumbnailOf(post: Post): string | undefined {
  return usable(post.preview?.url) ?? usable(post.sample?.url) ?? usable(post.file?.url);
}

function imageOf(post: Post): string | undefined {
  const sample = post.sample;
  const useFile =
    prefs.get<boolean>(PREF_FULL_RES) === true ||
    sample?.has === false ||
    (sample?.width ?? 0) < 800 ||
    (sample?.height ?? 0) < 1200;
  return (useFile ? usable(post.file?.url) : undefined) ?? usable(sample?.url) ?? usable(post.preview?.url);
}

function allTags(post: Post): string[] {
  return Object.values(post.tags ?? {}).flat();
}

function parseBlacklist(): string[][] {
  return pref(PREF_BLACKLIST)
    .split(/\s+/)
    .filter(Boolean)
    .map((group) => group.split('+').filter(Boolean));
}

async function fetchPosts(ids: number[]): Promise<Post[]> {
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const url = withQuery(`${BASE_URL}/posts.json`, {
          tags: `status:all id:${chunk.join(',')}`,
          limit: String(chunk.length),
        });
        const data = await getJson<{ posts?: Post[] }>(url);
        return (data.posts ?? []).sort((a, b) => chunk.indexOf(a.id) - chunk.indexOf(b.id));
      } catch {
        return [] as Post[];
      }
    }),
  );
  return results.flat();
}

async function poolsToPage(pools: Pool[], hasNextPage: boolean): Promise<MangaPage> {
  const firstIds = pools.flatMap((pool) => (pool.post_ids?.[0] !== undefined ? [pool.post_ids[0]] : []));
  const thumbs = new Map<number, string>();
  for (const post of await fetchPosts(firstIds)) {
    const thumb = thumbnailOf(post);
    if (thumb) thumbs.set(post.id, thumb);
  }
  const items = pools.map((pool): MangaSummary => ({
    url: `/pools/${pool.id}`,
    title: pool.name.replace(/_/g, ' '),
    thumbnailUrl: pool.post_ids?.[0] !== undefined ? thumbs.get(pool.post_ids[0]) : undefined,
  }));
  return { items, hasNextPage };
}

async function searchPools(
  page: number,
  query: string,
  order: string,
  category: string,
  activeOnly: boolean,
  description: string,
): Promise<MangaPage> {
  const params: Record<string, string | undefined> = {
    page: String(page),
    'search[order]': order,
    limit: String(POOL_PAGE_SIZE),
    'search[category]': category || undefined,
    'search[is_active]': activeOnly ? 'true' : undefined,
    'search[name_matches]': query.trim() ? `*${query.trim().replace(/ /g, '_')}*` : undefined,
    'search[description_matches]': description || undefined,
  };
  const pools = await getJson<Pool[]>(withQuery(`${BASE_URL}/pools.json`, params));
  return poolsToPage(pools, pools.length >= POOL_PAGE_SIZE);
}

export default defineExtension({
  preferences: () => preferences,
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => searchPools(page, '', 'post_count', '', false, ''),
    getLatest: (page) => searchPools(page, '', 'created_at', '', false, ''),
    search: (query, page, filters) => {
      const order = typeof filters.order === 'string' && filters.order ? filters.order : 'updated_at';
      const category = typeof filters.category === 'string' ? filters.category : '';
      const description = typeof filters.description === 'string' ? filters.description.trim() : '';
      return searchPools(page, query, order, category, filters.active === true, description);
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'category',
        label: 'Category',
        options: CATEGORIES.map(([label, value]) => ({ label, value })),
      },
      {
        type: 'select',
        id: 'order',
        label: 'Order',
        options: ORDERS.map(([label, value]) => ({ label, value })),
        default: 'updated_at',
      },
      { type: 'checkbox', id: 'active', label: 'Active pools only' },
      { type: 'text', id: 'description', label: 'Description contains' },
    ],
    getMangaDetails: async (manga) => {
      const pool = await getJson<Pool>(`${BASE_URL}${manga.url}.json`);
      const description = pool.description ?? '';
      return {
        url: manga.url,
        title: pool.name.replace(/_/g, ' '),
        thumbnailUrl: manga.thumbnailUrl,
        description: description.length > 400 ? `${description.slice(0, 400)} ...` : description,
        status: pool.is_active === true ? 'ongoing' : pool.is_active === false ? 'completed' : 'unknown',
      };
    },
    getChapters: async (manga): Promise<Chapter[]> => {
      const pool = await getJson<Pool>(`${BASE_URL}${manga.url}.json`);
      const count = pool.post_ids?.length ?? 0;
      if (count === 0) return [];
      return [
        {
          url: `/pools/${pool.id}`,
          name: `${pool.name.replace(/_/g, ' ')} (${count} pages)`,
          number: 1,
          uploadedAt: parseDate(pool.updated_at?.slice(0, 19), "yyyy-MM-dd'T'HH:mm:ss"),
        },
      ];
    },
    getPages: async (chapter): Promise<Page[]> => {
      const blacklist = parseBlacklist();
      let ids: number[];
      const poolMatch = /^\/pools\/(\d+)/.exec(chapter.url);
      const postMatch = /^\/posts\/(\d+)/.exec(chapter.url);
      if (poolMatch) ids = (await getJson<Pool>(`${BASE_URL}/pools/${poolMatch[1]}.json`)).post_ids ?? [];
      else if (postMatch) ids = [Number(postMatch[1])];
      else throw new Error('Unsupported chapter url');
      if (ids.length === 0) return [];
      const byId = new Map((await fetchPosts(ids)).map((post) => [post.id, post]));
      return ids.map((id, index) => {
        const post = byId.get(id);
        let imageUrl: string;
        if (!post || post.flags?.deleted) imageUrl = DELETED_PLACEHOLDER;
        else if (blacklist.some((group) => group.every((tag) => allTags(post).includes(tag)))) {
          imageUrl = BLACKLISTED_PLACEHOLDER;
        } else imageUrl = imageOf(post) ?? NO_IMAGE_PLACEHOLDER;
        return { index, imageUrl };
      });
    },
    imageHeaders: () => ({ 'User-Agent': USER_AGENT }),
    resolveUrl: (url) => {
      if (hostOf(url) !== hostOf(BASE_URL)) return null;
      const id = /\/pools\/(\d+)/.exec(url)?.[1];
      return id ? { url: `/pools/${id}`, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
