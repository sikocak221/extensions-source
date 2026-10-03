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

const BASE_URL = 'https://stonescape.xyz';
const API_URL = `${BASE_URL}/api`;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const GENRES: [string, string][] = [
  ['Action', 'action'],
  ['Adaptation', 'adaptation'],
  ['Adult', 'adult'],
  ['Adventure', 'adventure'],
  ['Comedy', 'comedy'],
  ['Demons', 'demons'],
  ['Drama', 'drama'],
  ['Ecchi', 'ecchi'],
  ['Fantasy', 'fantasy'],
  ['Gender Bender', 'genderbender'],
  ['Gore', 'gore'],
  ['Harem', 'harem'],
  ['Historical', 'historical'],
  ['Horror', 'horror'],
  ['Isekai', 'isekai'],
  ['Josei', 'josei'],
  ['Magic', 'magic'],
  ['Martial Arts', 'martialarts'],
  ['Mature', 'mature'],
  ['Mecha', 'mecha'],
  ['Military', 'military'],
  ['Monsters', 'monsters'],
  ['Mystery', 'mystery'],
  ['Post-Apocalyptic', 'post-apocalyptic'],
  ['Psychological', 'psychological'],
  ['Romance', 'romance'],
  ['School Life', 'schoollife'],
  ['Sci-Fi', 'sci-fi'],
  ['Seinen', 'seinen'],
  ['Shoujo', 'shoujo'],
  ['Shoujo Ai', 'shoujoai'],
  ['Shounen', 'shounen'],
  ['Shounen Ai', 'shounenai'],
  ['Slice of Life', 'sliceoflife'],
  ['Smut', 'smut'],
  ['Sports', 'sports'],
  ['Supernatural', 'supernatural'],
  ['Thriller', 'thriller'],
  ['Tragedy', 'tragedy'],
  ['Video Games', 'video-games'],
  ['Webtoons', 'webtoons'],
  ['Wuxia', 'wuxia'],
  ['Yaoi', 'yaoi'],
  ['Yuri', 'yuri'],
];

interface SeriesDto {
  title: string;
  slug: string;
  coverUrl?: string | null;
  description?: string | null;
  publicationStatus?: string | null;
  author?: string | null;
  artist?: string | null;
  genres?: string[] | null;
}

interface ChapterDto {
  chapterId: string;
  chapterNumber: string;
  title?: string | null;
  createdAt?: string | null;
}

async function api<T>(path: string): Promise<T> {
  const response = await http.get(`${API_URL}${path}`, { headers });
  return JSON.parse(response.body) as T;
}

const toSummary = (s: SeriesDto): MangaSummary => ({
  url: `/series/${s.slug}`,
  title: s.title,
  thumbnailUrl: s.coverUrl ? BASE_URL + s.coverUrl : undefined,
});

async function seriesPage(path: string): Promise<MangaPage> {
  const result = await api<{ data: SeriesDto[]; pagination?: { page?: number; totalPages?: number } }>(path);
  return {
    items: result.data.map(toSummary),
    hasNextPage: (result.pagination?.page ?? 1) < (result.pagination?.totalPages ?? 1),
  };
}

const squash = (text: string) => text.replace(/[- ]/g, '').toLowerCase();

function findGenre(query: string): string | undefined {
  const q = query.toLowerCase();
  return GENRES.find(([name, slug]) => name.toLowerCase() === q || slug === q || squash(name) === squash(query))?.[1];
}

const genreLabel = (slug: string) =>
  GENRES.find(([, s]) => s === slug.toLowerCase())?.[0] ?? slug.charAt(0).toUpperCase() + slug.slice(1);

function status(text: string | null | undefined): MangaStatus {
  switch (text?.toLowerCase()) {
    case 'ongoing':
      return 'ongoing';
    case 'completed':
      return 'completed';
    case 'hiatus':
      return 'hiatus';
    case 'dropped':
    case 'cancelled':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

const slugOf = (url: string) => url.replace(/\/+$/, '').split('/').pop() ?? '';

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => seriesPage(`/series/popular?page=${page}&period=week&contentType=manhwa&limit=24`),
    getLatest: (page) => seriesPage(`/series?page=${page}&limit=24&contentType=manhwa`),
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params = [`page=${page}`, 'limit=24', 'contentType=manhwa'];
      if (typeof filters.status === 'string' && filters.status) params.push(`status=${filters.status}`);
      const genres = GENRES.filter(([, slug]) => filters[`genre.${slug}`] === true).map(([, slug]) => slug);
      if (query.trim()) {
        // Searching for a genre name filters by that genre instead.
        const genre = findGenre(query.trim());
        if (genre) {
          if (!genres.includes(genre)) genres.push(genre);
        } else params.push(`search=${encodeURIComponent(query.trim())}`);
      }
      if (genres.length) params.push(`genres=${genres.join(',')}`);
      return seriesPage(`/series?${params.join('&')}`);
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [
          { label: 'All', value: '' },
          { label: 'Ongoing', value: 'ongoing' },
          { label: 'Completed', value: 'completed' },
          { label: 'Hiatus', value: 'hiatus' },
        ],
        default: '',
      },
      {
        type: 'group',
        id: 'genre',
        label: 'Genres',
        filters: GENRES.map(([label, slug]) => ({ type: 'checkbox', id: `genre.${slug}`, label })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const s = await api<SeriesDto>(`/series/by-slug/${slugOf(manga.url)}`);
      return {
        ...toSummary(s),
        description: s.description || undefined,
        status: status(s.publicationStatus),
        author: s.author || undefined,
        artist: s.artist || undefined,
        genres: (s.genres ?? []).map(genreLabel),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const slug = slugOf(manga.url);
      const { chapters } = await api<{ chapters: ChapterDto[] }>(`/series/by-slug/${slug}/chapters`);
      return chapters
        .map((c) => {
          const parsed = Number.parseFloat(c.chapterNumber);
          const number = Number.isNaN(parsed) ? c.chapterNumber : String(parsed);
          const date = c.createdAt ? Date.parse(c.createdAt) : NaN;
          return {
            url: `/series/${slug}/ch-${number}#${c.chapterId}`,
            name: `Chapter ${number}${c.title ? ` - ${c.title}` : ''}`,
            number: Number.isNaN(parsed) ? undefined : parsed,
            uploadedAt: Number.isNaN(date) ? undefined : date,
          };
        })
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const id = chapter.url.split('#')[1] ?? '';
      const result = await api<{
        pages?: { pageNumber?: number; url: string }[];
        images?: { pageNumber?: number; url: string }[];
      }>(`/chapters/${id}/pages`);
      const pages = result.pages?.length ? result.pages : (result.images ?? []);
      return pages.map((p, index) => ({
        index: p.pageNumber && p.pageNumber > 0 ? p.pageNumber - 1 : index,
        imageUrl: BASE_URL + p.url,
      }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/series\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/series/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url.split('#')[0]!),
  }),
});
