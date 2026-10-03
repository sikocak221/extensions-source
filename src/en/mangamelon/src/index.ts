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
import { USER_AGENT, absoluteUrl, hostOf } from './common/utils';

const BASE_URL = 'https://mangamelon.com';
const API_BASE = 'https://api.mangamelon.com';
const PAGE_SIZE = 36;
const CHAPTER_LIMIT = 1000;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, Origin: BASE_URL };

const SORTS: [string, string][] = [
  ['Latest', 'latest'],
  ['Hot', 'popular'],
  ['Top Rated', 'rating'],
  ['New', 'newest'],
];

const GENRES = [
  'Action',
  'Adult',
  'Adventure',
  'Comedy',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Gender Bender',
  'Harem',
  'Hentai',
  'Historical',
  'Horror',
  'Isekai',
  'Josei',
  'Martial Arts',
  'Mature',
  'Mecha',
  'Mystery',
  'Psychological',
  'Romance',
  'School Life',
  'Sci-Fi',
  'Seinen',
  'Shoujo',
  'Shoujo Ai',
  'Shounen',
  'Shounen Ai',
  'Slice of Life',
  'Smut',
  'Sports',
  'Supernatural',
  'Tragedy',
  'Yaoi',
  'Yuri',
  'Doujinshi',
  'Manhua',
  'Manhwa',
  'Shotacon',
  'Wuxia',
  'Gore',
];

interface MangaDto {
  id: string;
  title: string;
  cover?: string | null;
  desc?: string | null;
  status?: string | null;
  authors?: string | null;
  genres?: string[] | null;
}

interface ChapterDto {
  id: string;
  title: string;
  seq?: number;
  updated?: string | null;
  pages?: { url: string; seq?: number }[];
}

// Request bodies must carry every field (e.g. includeNsfw), or the server applies its own defaults.
async function api<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await http.post(
    `${API_BASE}/${path}`,
    { form: { data: base64.encode(JSON.stringify(body)), sessionid: '' } },
    { headers },
  );
  return JSON.parse(response.body) as T;
}

function status(text: string | null | undefined): MangaStatus {
  switch (text?.toLowerCase()) {
    case 'ongoing':
      return 'ongoing';
    case 'completed':
      return 'completed';
    case 'on hiatus':
    case 'hiatus':
      return 'hiatus';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

const toSummary = (m: MangaDto): MangaSummary => ({
  url: `/manga/${m.id}`,
  title: m.title,
  thumbnailUrl: m.cover || undefined,
});

const mangaId = (url: string) => url.split('/').filter(Boolean)[1] ?? '';

async function mangaPage(page: number, sort: string, search = '', genre = ''): Promise<MangaPage> {
  const skip = (page - 1) * PAGE_SIZE;
  const response = await api<{ list: MangaDto[]; total?: number }>('api/manga/list', {
    search,
    genre,
    lang: 'en',
    sort,
    includeNsfw: true,
    limit: PAGE_SIZE,
    skip,
  });
  const items = response.list.map(toSummary);
  const total = response.total ?? -1;
  return { items, hasNextPage: total > 0 ? skip + items.length < total : items.length >= PAGE_SIZE };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => mangaPage(page, 'popular'),
    getLatest: (page) => mangaPage(page, 'latest'),
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const sort = filters.sort as { value?: string } | undefined;
      return mangaPage(
        page,
        sort?.value || 'latest',
        query.trim(),
        typeof filters.genre === 'string' ? filters.genre : '',
      );
    },
    getFilters: (): Filter[] => [
      {
        type: 'sort',
        id: 'sort',
        label: 'Sort',
        options: SORTS.map(([label, value]) => ({ label, value })),
        default: { value: 'latest', ascending: false },
      },
      {
        type: 'select',
        id: 'genre',
        label: 'Genre',
        options: [{ label: 'All', value: '' }, ...GENRES.map((g) => ({ label: g, value: g }))],
        default: '',
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { manga: m } = await api<{ manga: MangaDto }>('api/manga/get', {
        target: mangaId(manga.url),
        withReviews: false,
      });
      return {
        ...toSummary(m),
        description: m.desc || undefined,
        author: m.authors || undefined,
        genres: m.genres ?? [],
        status: status(m.status),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const id = mangaId(manga.url);
      const chapters: ChapterDto[] = [];
      for (let skip = 0; ;) {
        const response = await api<{ chapters?: ChapterDto[] }>('api/chapter/list', {
          target: id,
          status: 0,
          limit: CHAPTER_LIMIT,
          skip,
          pending: '',
          force: true,
        });
        const batch = response.chapters ?? [];
        chapters.push(...batch);
        skip += batch.length;
        if (batch.length < CHAPTER_LIMIT) break;
      }
      return chapters
        .sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0))
        .map((c) => {
          const date = c.updated && !c.updated.startsWith('0001-') ? Date.parse(c.updated) : NaN;
          return {
            url: `/chapter/${id}/${c.id}`,
            name: c.title,
            uploadedAt: Number.isNaN(date) ? undefined : date,
          };
        });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const target = chapter.url.split('/').filter(Boolean)[2] ?? '';
      const { chapter: c } = await api<{ chapter: ChapterDto }>('api/chapter/get', { target, all: true });
      return (c.pages ?? [])
        .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
        .map((p, index) => ({ index, imageUrl: p.url }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/(?:manga|chapter)\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/manga/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
