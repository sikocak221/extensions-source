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
import { USER_AGENT, hostOf, parseDate, withQuery } from './common/utils';

const BASE_URL = 'https://mangade.io';
const API = 'https://api.mangade.io/api';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const SORTS = [
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
  { label: 'Most viewed', value: 'most-viewed' },
  { label: 'Highly rate', value: 'rating' },
  { label: 'Name A-Z', value: 'a-z' },
  { label: 'Name Z-A', value: 'z-a' },
];
const STATUSES = [
  { label: 'All', value: '' },
  { label: 'Completed', value: '1' },
  { label: 'Releasing', value: '2' },
  { label: 'On Hiatus', value: '3' },
];
const TYPES = [
  { label: 'All', value: '' },
  { label: 'Manga', value: 'manga' },
  { label: 'One-Shot', value: 'one-shot' },
  { label: 'Dounjinshi', value: 'dounjinshi' },
  { label: 'Manhwa', value: 'manhwa' },
  { label: 'Manhua', value: 'manhua' },
];
const CHAPTER_COUNTS = [
  { label: '>=0', value: '0' },
  { label: '>=50', value: '50' },
  { label: '>=100', value: '100' },
  { label: '>=150', value: '150' },
  { label: '>=200', value: '200' },
  { label: '>=250', value: '250' },
];

interface Comic {
  id: string;
  name: string;
  slug?: string | null;
  image: string;
  description?: string | null;
  genre_names?: string | null;
  status?: string | null;
  news_chapters?: {
    id: string;
    name: string;
    slug?: string | null;
    chapter_number?: string | null;
    published_date?: string | null;
  }[];
}

const api = async <T>(url: string) => (await http.get<{ data: T }>(url, { headers, responseType: 'json' })).body.data;

// Manga urls are "/comic/<slug>-pid<id>", chapter urls "/comic/<slug>-<manga id>/<chapter slug>#<chapter id>".
const mangaId = (url: string) => /-pid(\d+)/.exec(url)?.[1] ?? '';
const toSummary = (c: Comic): MangaSummary => ({
  url: `/comic/${c.slug}-pid${c.id}`,
  title: c.name,
  thumbnailUrl: c.image,
});

async function search(page: number, query: string, filters: FilterState): Promise<MangaPage> {
  const text = (id: string) => (typeof filters[id] === 'string' && filters[id] ? (filters[id] as string) : undefined);
  const genres = Object.entries(filters)
    .filter(([id, v]) => id.startsWith('genre.') && v === true)
    .map(([id]) => `genres[]=${id.slice(6)}`);
  const url = withQuery(`${API}/comics`, {
    page: String(page),
    size: '20',
    name: query.trim() || undefined,
    sort: text('sort') ?? 'newest',
    comic_status: text('status'),
    category: text('type'),
    year: text('year'),
    min_chapter_count: text('chapters') ?? '0',
  });
  const data = await api<{ list: Comic[]; totalPage: number; page: string }>(
    genres.length ? `${url}&${genres.join('&')}` : url,
  );
  return { items: data.list.map(toSummary), hasNextPage: Number(data.page) < data.totalPage };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => search(page, '', { sort: 'most-viewed' }),
    getLatest: (page) => search(page, '', { sort: 'newest' }),
    search: (query, page, filters) => search(page, query, filters),
    async getFilters(): Promise<Filter[]> {
      const year = new Date().getFullYear();
      const filters: Filter[] = [
        { type: 'select', id: 'sort', label: 'Sort', options: SORTS },
        { type: 'select', id: 'status', label: 'Status', options: STATUSES },
        { type: 'select', id: 'type', label: 'Type', options: TYPES },
        {
          type: 'select',
          id: 'year',
          label: 'Year',
          options: [
            { label: 'All', value: '' },
            ...Array.from({ length: year - 2018 }, (_, i) => String(year - i)).map((y) => ({ label: y, value: y })),
          ],
        },
        { type: 'select', id: 'chapters', label: 'Chapter count', options: CHAPTER_COUNTS },
      ];
      try {
        const genres = (await api<{ genres: { id: string; name: string }[] }>(`${API}/genres?size=500`)).genres;
        if (genres.length)
          filters.push(
            { type: 'separator' },
            {
              type: 'group',
              id: 'genre',
              label: 'Genres',
              filters: genres.map((g) => ({ type: 'checkbox', id: `genre.${g.id}`, label: g.name })),
            },
          );
      } catch (error) {
        log.warn('Cannot load genres', error);
      }
      return filters;
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const c = await api<Comic>(`${API}/comics/${mangaId(manga.url)}/view`);
      const statuses: Record<string, MangaStatus> = {
        Ongoing: 'ongoing',
        Releasing: 'ongoing',
        Completed: 'completed',
        'On Hiatus': 'hiatus',
      };
      return {
        ...toSummary(c),
        url: manga.url,
        description: c.description || undefined,
        genres: c.genre_names?.split(',').map((g) => g.trim()),
        status: statuses[c.status ?? ''] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const c = await api<Comic>(`${API}/comics/${mangaId(manga.url)}/view`);
      return (c.news_chapters ?? []).map((ch) => ({
        url: `/comic/${c.slug}-${c.id}/${ch.slug}#${ch.id}`,
        name: ch.name,
        number: ch.chapter_number ? Number(ch.chapter_number) : undefined,
        uploadedAt: parseDate(ch.published_date, 'yyyy-MM-dd HH:mm:ss'),
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const data = await api<{ chapter_images?: { image: string }[] }>(
        `${API}/chapters/${chapter.url.split('#')[1]}/view`,
      );
      return (data.chapter_images ?? []).map((p, index) => ({ index, imageUrl: p.image }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/comic\/([^/?#]+-pid\d+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/comic/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => `${BASE_URL}${item.url.split('#')[0]}`,
  }),
});
