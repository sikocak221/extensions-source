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
import { USER_AGENT, hostOf } from './common/utils';

const BASE_URL = 'https://hentara.com';
const DATA = `${BASE_URL}/r2-data`;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const GENRES = [
  'Any',
  'Action',
  'BL',
  'Cheating',
  'Detective',
  'Drama',
  'Harem',
  'In-Law',
  'MILF',
  'Married',
  'Office',
  'Romance',
  'Spin-Off',
  'Thriller',
  'University',
  'College',
  'Nerd',
];

interface Comic {
  title: string;
  slug: string;
  description?: string | null;
  thumbnail_url?: string | null;
  view_count?: number;
  latest_episode_date?: string | null;
  genres?: { name: string }[];
}

const json = async <T>(path: string) => (await http.get<T>(`${DATA}${path}`, { headers, responseType: 'json' })).body;

// The whole library is one static index file; it is filtered and sorted here.
async function index(query: string, sort: string, genre: string): Promise<MangaPage> {
  const q = query.trim().toLowerCase();
  let comics = (await json<{ comics?: Comic[] }>('/index.json')).comics ?? [];
  comics = comics.filter(
    (c) =>
      (!q || c.title.toLowerCase().includes(q)) &&
      (genre === 'Any' || (c.genres ?? []).some((g) => g.name.toLowerCase() === genre.toLowerCase())),
  );
  if (sort === 'latest')
    comics.sort(
      (a, b) => (Date.parse(b.latest_episode_date ?? '') || 0) - (Date.parse(a.latest_episode_date ?? '') || 0),
    );
  else if (sort === 'popular') comics.sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0));
  else comics.sort((a, b) => a.title.localeCompare(b.title));
  return {
    items: comics.map((c) => ({
      url: `/manhwa/${c.slug}`,
      title: c.title,
      thumbnailUrl: c.thumbnail_url || undefined,
    })),
    hasNextPage: false,
  };
}

const slugOf = (url: string) => url.split('/')[2] ?? '';

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: () => index('', 'popular', 'Any'),
    getLatest: () => index('', 'latest', 'Any'),
    search: (query: string, _page: number, filters: FilterState) =>
      index(
        query,
        typeof filters.sort === 'string' && filters.sort ? filters.sort : 'latest',
        typeof filters.genre === 'string' && filters.genre ? filters.genre : 'Any',
      ),
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'sort',
        label: 'Sort',
        options: ['Latest', 'Popular', 'Alphabetical'].map((l) => ({ label: l, value: l.toLowerCase() })),
      },
      { type: 'select', id: 'genre', label: 'Genre', options: GENRES.map((g) => ({ label: g, value: g })) },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { comic } = await json<{ comic: Comic }>(`/comics/${slugOf(manga.url)}.json`);
      return {
        url: manga.url,
        title: comic.title,
        thumbnailUrl: comic.thumbnail_url || manga.thumbnailUrl,
        description: comic.description || undefined,
        genres: comic.genres?.map((g) => g.name),
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const data = await json<{
        comic: Comic;
        episodes?: { episode_number: number; title?: string | null; created_at?: string | null }[];
      }>(`/comics/${slugOf(manga.url)}.json`);
      return (data.episodes ?? [])
        .map((ep) => {
          const time = ep.created_at ? Date.parse(ep.created_at) : Number.NaN;
          return {
            url: `/manhwa/${data.comic.slug}/chapter-${ep.episode_number}`,
            name: `Chapter ${ep.episode_number}${ep.title ? ` - ${ep.title}` : ''}`,
            number: ep.episode_number,
            uploadedAt: Number.isFinite(time) ? time : undefined,
          };
        })
        .sort((a, b) => b.number - a.number);
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [, slug, ep] = chapter.url.split('/').filter(Boolean);
      const data = await json<{ pages?: { page_number: number; image_url: string }[] }>(
        `/episodes/${slug}/${ep?.replace('chapter-', '')}.json`,
      );
      return (data.pages ?? [])
        .sort((a, b) => a.page_number - b.page_number)
        .map((p, index) => ({ index, imageUrl: p.image_url }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/manhwa\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/manhwa/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
