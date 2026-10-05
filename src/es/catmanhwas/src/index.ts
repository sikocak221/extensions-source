import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf } from './common/utils';
import { GENRES, ORDERS } from './filters';

const BASE_URL = 'https://cattoons.org';
const CHAPTERS_PER_PAGE = 100;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

// SvelteKit app. Listings and pages come from `__data.json`; latest updates, details and chapters from
// remote functions (`/_app/remote/<id>/<name>`) whose ids change with each deploy. Known ids are tried
// first; on a 404 the client chunks are crawled for `"<id>/<name>"` and the result is kept in storage.
const DEFAULT_IDS: Record<string, string> = {
  getLatestChapters: 'nhjrhc',
  getSerieDetails: '130a4lj',
  getChapters: '130a4lj',
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** devalue: every value is an index into the flat array (negative indices are special constants). */
function devalue(data: Json[]): Json {
  const cache = new Map<number, Json>();
  const resolve = (index: number): Json => {
    if (index < 0) return null;
    if (cache.has(index)) return cache.get(index)!;
    const value = data[index]!;
    if (Array.isArray(value)) {
      const out: Json[] = [];
      cache.set(index, out);
      for (const item of value) out.push(typeof item === 'number' ? resolve(item) : item);
      return out;
    }
    if (value && typeof value === 'object') {
      const out: Record<string, Json> = {};
      cache.set(index, out);
      for (const [key, item] of Object.entries(value)) out[key] = typeof item === 'number' ? resolve(item) : item;
      return out;
    }
    return value;
  };
  return resolve(0);
}

async function pageData<T>(path: string): Promise<T> {
  const url = `${BASE_URL}${path}${path.includes('?') ? '&' : '?'}x-sveltekit-invalidated=001`;
  const result = (await http.get<{ nodes: { type: string; data?: Json[] }[] }>(url, { headers, responseType: 'json' }))
    .body;
  const node = result.nodes.find((n) => n.type === 'data' && n.data);
  if (!node?.data) throw new Error('No data node');
  return devalue(node.data) as T;
}

async function discoverRemoteId(name: string): Promise<string | undefined> {
  const home = (await http.get(BASE_URL + '/', { headers })).body;
  const queue = [...home.matchAll(/["'](\.?\/?_app\/immutable\/[^"']+\.js)["']/g)].map(
    (m) => `${BASE_URL}/${m[1]!.replace(/^\.?\//, '')}`,
  );
  const seen = new Set<string>();
  const pattern = new RegExp(`["']([a-z0-9]+)/${name}["']`);
  while (queue.length && seen.size < 200) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    const js = (await http.get(url, { headers }).catch(() => undefined))?.body ?? '';
    const found = pattern.exec(js)?.[1];
    if (found) return found;
    const dir = url.slice(0, url.lastIndexOf('/') + 1);
    for (const m of js.matchAll(/["'](\.{1,2}\/[^"']+\.js)["']/g)) {
      const parts = (dir + m[1]).split('/');
      const out: string[] = [];
      for (const part of parts) {
        if (part === '..') out.pop();
        else if (part !== '.') out.push(part);
      }
      queue.push(out.join('/'));
    }
  }
  return undefined;
}

const remoteIds = new Map<string, string>();

async function remote<T>(name: string, payload: string): Promise<T> {
  const call = async (id: string) =>
    http.request<{ type: string; result: string }>({
      url: `${BASE_URL}/_app/remote/${id}/${name}?payload=${encodeURIComponent(base64.encode(payload))}`,
      headers,
      responseType: 'json',
    });
  let id = remoteIds.get(name) ?? (await storage.get<string>(`remote:${name}`)) ?? DEFAULT_IDS[name]!;
  let response = await call(id);
  if (response.status === 404) {
    const found = await discoverRemoteId(name);
    if (!found) throw new Error(`No se encontró la función remota ${name}`);
    id = found;
    await storage.set(`remote:${name}`, id);
    response = await call(id);
  }
  if (response.status >= 400) throw new Error(`HTTP ${response.status} (${name})`);
  remoteIds.set(name, id);
  return devalue(JSON.parse(response.body.result) as Json[]) as T;
}

interface SeriesDto {
  name: string;
  slug: string;
  cover_url?: string | null;
}

interface Pagination {
  current_page: number;
  last_page: number;
}

const summary = (s: SeriesDto): MangaSummary => ({
  url: `/series/${s.slug}`,
  title: s.name,
  thumbnailUrl: s.cover_url || undefined,
});
const slugOf = (url: string) => url.split('/')[2] ?? '';

async function browse(page: number, params: Record<string, string>): Promise<MangaPage> {
  const query = Object.entries({ page: String(page), ...params })
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  const data = await pageData<{ series: SeriesDto[]; lastPage: number; page: number }>(`/series/__data.json?${query}`);
  return { items: data.series.map(summary), hasNextPage: data.page < data.lastPage };
}

const STATUS: Record<string, MangaStatus> = { 'on-going': 'ongoing', end: 'completed', 'on-hold': 'hiatus' };

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => browse(page, { sort: 'popular' }),
    async getLatest(page: number): Promise<MangaPage> {
      const data = await remote<{ data: { serie: SeriesDto }[]; pagination: Pagination }>(
        'getLatestChapters',
        `[${page}]`,
      );
      const seen = new Set<string>();
      const items = data.data.map((d) => summary(d.serie)).filter((m) => !seen.has(m.url) && Boolean(seen.add(m.url)));
      return { items, hasNextPage: data.pagination.current_page < data.pagination.last_page };
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'genre',
        label: 'Género',
        default: '',
        options: GENRES.map(([label, value]) => ({ label, value })),
      },
      {
        type: 'select',
        id: 'sort',
        label: 'Ordenar por',
        default: 'popular',
        options: ORDERS.map(([label, value]) => ({ label, value })),
      },
    ],
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params: Record<string, string> = {};
      if (typeof filters.genre === 'string') params.genre = filters.genre;
      if (typeof filters.sort === 'string') params.sort = filters.sort;
      if (query.trim()) params.search = query.trim();
      return browse(page, params);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const slug = slugOf(manga.url);
      const [page, details] = await Promise.all([
        pageData<{ seo: { name: string; description?: string | null; cover_url?: string | null } }>(
          `/series/${slug}/__data.json`,
        ),
        remote<{ status?: string | null; type?: string | null; genres?: { name: string }[] | null }>(
          'getSerieDetails',
          JSON.stringify([slug]),
        ),
      ]);
      return {
        url: manga.url,
        title: page.seo.name,
        description: page.seo.description || undefined,
        thumbnailUrl: page.seo.cover_url || manga.thumbnailUrl,
        status: STATUS[details.status ?? ''] ?? 'unknown',
        genres: [
          ...(details.type ? [details.type.charAt(0).toUpperCase() + details.type.slice(1)] : []),
          ...(details.genres ?? []).map((g) => g.name),
        ],
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const slug = slugOf(manga.url);
      const chapters: Chapter[] = [];
      for (let page = 1; ; page++) {
        const payload = `[["__skrao",1],{"page":2,"slug":3,"perPage":4},${page},${JSON.stringify(slug)},${CHAPTERS_PER_PAGE}]`;
        const data = await remote<{
          data: { id: number; number: number; name?: string | null; published_at: string }[];
          pagination: Pagination;
        }>('getChapters', payload);
        for (const c of data.data) {
          const time = Date.parse(c.published_at);
          chapters.push({
            url: `/series/${slug}/${c.id}`,
            name: `Capítulo ${c.number}${c.name ? `: ${c.name}` : ''}`,
            number: c.number,
            uploadedAt: Number.isNaN(time) ? undefined : time,
          });
        }
        if (data.pagination.current_page >= data.pagination.last_page || !data.data.length) break;
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const data = await pageData<{ chapter: { images: string[] } }>(`${chapter.url}/__data.json`);
      return data.chapter.images.map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/series\/([^/?#]+)\/?(?:[?#]|$)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/series/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
