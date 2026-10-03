import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf } from './common/utils';

const BASE_URL = 'https://pornhwa18.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const PAGE_SIZE = 18;

interface SeriesDto {
  id: number;
  title: string;
  slug: string;
  synopsis?: string | null;
  alter?: string | null;
  poster?: string | null;
  type?: string | null;
  status?: string | null;
  chapters?: { id: number; chapter: number; created_at?: string | null; images?: Record<string, { src: string }> }[];
  taxonomy_relation?: { taxonomy: { name: string; type: string } }[];
}

// Qwik route data ("q-data.json"): values live in a flat _objs table, references are base-36 indexes.
async function qwik<T>(path: string): Promise<T> {
  const root = (
    await http.get<{ _objs: unknown[]; _entry: string }>(`${BASE_URL}${path}`, { headers, responseType: 'json' })
  ).body;
  const resolve = (ref: unknown): unknown => {
    const value = root._objs[Number.parseInt(String(ref), 36)];
    if (Array.isArray(value)) return value.map(resolve);
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v)]));
    if (typeof value === 'string') {
      if (value === '\u0001') return null;
      return value.length > 0 && value.charCodeAt(0) < 32 ? value.slice(1) : value;
    }
    return value;
  };
  const entry = resolve(root._entry) as { loaders: Record<string, unknown> };
  return Object.values(entry.loaders).find((v) => v != null) as T;
}

const poster = (url?: string | null) => url?.replace('/188.165.221.196/', '/manhwa18.com/') || undefined;

async function listing(path: string, page: number): Promise<MangaPage> {
  const all = await qwik<SeriesDto[]>(`${path}q-data.json${page > 1 ? `?page=${page}` : ''}`);
  return {
    items: all
      .slice((page - 1) * PAGE_SIZE)
      .filter((s) => s.slug)
      .map((s) => ({ url: `/comic/${s.slug}/`, title: s.title, thumbnailUrl: poster(s.poster) })),
    hasNextPage: all.length >= page * PAGE_SIZE,
  };
}

const slugOf = (url: string) => url.split('/').filter(Boolean)[1] ?? '';

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => listing('/popular/', page),
    getLatest: (page) => listing('/', page),
    search: (query, page) => listing(`/search/${encodeURIComponent(query.trim())}/`, page),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const s = await qwik<SeriesDto>(`/comic/${slugOf(manga.url)}/q-data.json`);
      const tax = (s.taxonomy_relation ?? []).map((t) => t.taxonomy);
      const names = (type: string) => tax.filter((t) => t.type === type).map((t) => t.name);
      const statuses: Record<string, MangaStatus> = { 'on-going': 'ongoing', end: 'completed', 'on-hold': 'hiatus' };
      const description = [s.synopsis?.trim(), s.alter?.trim() ? `Alternative titles: ${s.alter}` : '']
        .filter(Boolean)
        .join('\n\n');
      return {
        url: manga.url,
        title: s.title,
        thumbnailUrl: poster(s.poster),
        author: names('author').join(', ') || undefined,
        artist: names('artist').join(', ') || undefined,
        genres: [...(s.type ? [s.type] : []), ...names('genre')],
        description: description || undefined,
        status: statuses[s.status ?? ''] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const s = await qwik<SeriesDto>(`/comic/${slugOf(manga.url)}/q-data.json`);
      return (s.chapters ?? []).map((c) => {
        const number = String(c.chapter).replace(/\.0$/, '');
        const time = c.created_at ? Date.parse(c.created_at) : Number.NaN;
        return {
          url: `/comic/${s.slug}/chapter-${number}/`,
          name: `Chapter ${number}`,
          number: c.chapter,
          uploadedAt: Number.isFinite(time) ? time : undefined,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const data = await qwik<{ data: SeriesDto }>(`${chapter.url}q-data.json`);
      const images = data.data.chapters?.[0]?.images ?? {};
      return Object.entries(images)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, image], index) => ({ index, imageUrl: image.src }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/comic\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/comic/${match[2]}/`, title: '' } : null;
    },
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
