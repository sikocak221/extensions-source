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
import { USER_AGENT, findRscObject, hostOf, withQuery } from './common/utils';

const BASE_URL = 'https://www.team-shadowi.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const GENRES: [string, string][] = [
  ['All', 'all'],
  ['Action', 'action'],
  ['Adventure', 'adventure'],
  ['Comedy', 'comedy'],
  ['Drama', 'drama'],
  ['Ecchi', 'ecchi'],
  ['Fantasy', 'fantasy'],
  ['Isekai', 'isekai'],
  ['Romance', 'romance'],
];
const SORTS: [string, string][] = [
  ['Rating', 'rating'],
  ['Latest', 'created'],
  ['Views', 'views'],
  ['Title', 'title'],
];

interface Series {
  title: string;
  slug: string;
  thumbnail_url?: string | null;
}

const statusOf = (s?: string | null): MangaStatus =>
  s?.toLowerCase() === 'ongoing' ? 'ongoing' : s?.toLowerCase() === 'completed' ? 'completed' : 'unknown';
const toSummary = (s: Series): MangaSummary => ({
  url: `/series/${s.slug}`,
  title: s.title,
  thumbnailUrl: s.thumbnail_url || undefined,
});

async function popular(page: number, sortBy: string, genre: string): Promise<MangaPage> {
  const url = withQuery(`${BASE_URL}/api/series/popular`, {
    timePeriod: 'all',
    genre,
    sortBy,
    offset: String((page - 1) * 20),
    limit: '20',
  });
  const data = (await http.get<{ data: Series[]; hasMore?: boolean }>(url, { headers, responseType: 'json' })).body;
  return { items: data.data.map(toSummary), hasNextPage: data.hasMore ?? false };
}

// The Next.js pages answer React Server Component payloads (header "Rsc: 1").
async function rsc<T>(path: string, key: string): Promise<T | undefined> {
  const body = (await http.get(`${BASE_URL}${path}`, { headers: { ...headers, Rsc: '1' } })).body;
  return findRscObject<T>(body, (value) => key in value && Array.isArray(value[key]) !== (key === 'series'));
}

interface SeriesData {
  series: {
    title: string;
    description?: string | null;
    thumbnail_url?: string | null;
    status?: string | null;
    genres?: string[] | null;
    tags?: string[] | null;
  };
  chapters?: { id: string; number: number; title?: string | null; created_at?: string | null }[];
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => popular(page, 'rating', 'all'),
    getLatest: (page) => popular(page, 'created', 'all'),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) {
        const data = (
          await http.get<{ series?: Series[] }>(withQuery(`${BASE_URL}/api/search`, { q: query.trim() }), {
            headers,
            responseType: 'json',
          })
        ).body;
        return { items: (data.series ?? []).map(toSummary), hasNextPage: false };
      }
      const text = (id: string, fallback: string) =>
        typeof filters[id] === 'string' && filters[id] ? (filters[id] as string) : fallback;
      return popular(page, text('sort', 'rating'), text('genre', 'all'));
    },
    getFilters: (): Filter[] => [
      { type: 'select', id: 'sort', label: 'Sort', options: SORTS.map(([label, value]) => ({ label, value })) },
      { type: 'select', id: 'genre', label: 'Genre', options: GENRES.map(([label, value]) => ({ label, value })) },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const data = await rsc<SeriesData>(manga.url, 'series');
      if (!data) throw new Error('Failed to extract data');
      const s = data.series;
      return {
        url: manga.url,
        title: s.title,
        description: s.description || undefined,
        thumbnailUrl: s.thumbnail_url || manga.thumbnailUrl,
        status: statusOf(s.status),
        genres: [...new Set([...(s.genres ?? []), ...(s.tags ?? [])])],
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const data = await rsc<SeriesData>(manga.url, 'series');
      if (!data) throw new Error('Failed to extract data');
      const slug = manga.url.split('/').pop();
      return (data.chapters ?? [])
        .map((c) => {
          const n = String(c.number).replace(/\.0$/, '');
          const time = c.created_at ? Date.parse(c.created_at) : Number.NaN;
          return {
            url: `/read/${slug}/${n}`,
            name: c.title?.trim() ? `Chapter ${n}: ${c.title}` : `Chapter ${n}`,
            number: c.number,
            uploadedAt: Number.isFinite(time) ? time : undefined,
          };
        })
        .sort((a, b) => b.number - a.number);
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const data = await rsc<{ pages: string[] }>(chapter.url, 'pages');
      return (data?.pages ?? []).map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/series\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/series/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
