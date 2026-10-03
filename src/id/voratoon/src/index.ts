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
import { USER_AGENT, withQuery } from './common/utils';

const BASE_URL = 'https://v5.voratoon.com';
const API_URL = 'https://api.voratoon.com';

// Manga urls are "/series/<slug>", chapter urls "/series/<slug>/chapter/<index>", like the site's pages.

interface SeriesItem {
  id: number;
  data: {
    slug?: string | null;
    title: string;
    author?: string | null;
    status?: string | null;
    synopsis?: string | null;
    coverImage?: string | null;
    genres?: { data: { name: string } }[] | null;
  };
}

interface ChapterItem {
  data: { index?: number | null; title?: string | null; images?: string[] | null };
  createdAt?: string | null;
  updatedAt?: string | null;
  chapterIndex?: number | null;
}

const headers = {
  'User-Agent': USER_AGENT,
  Referer: `${BASE_URL}/`,
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
};

async function api<T>(url: string): Promise<T> {
  return (await http.get<T>(url, { headers, responseType: 'json' })).body;
}

const STATUSES: Record<string, MangaStatus> = {
  ongoing: 'ongoing',
  'on going': 'ongoing',
  completed: 'completed',
  complete: 'completed',
  hiatus: 'hiatus',
  cancelled: 'cancelled',
  canceled: 'cancelled',
};

function toDetails(item: SeriesItem): MangaDetails {
  return {
    url: `/series/${item.data.slug ?? item.id}`,
    title: item.data.title,
    thumbnailUrl: item.data.coverImage || undefined,
    author: item.data.author || undefined,
    description: item.data.synopsis || undefined,
    genres: item.data.genres?.map((g) => g.data.name),
    status: STATUSES[item.data.status?.toLowerCase() ?? ''] ?? 'unknown',
  };
}

async function series(params: Record<string, string | undefined>): Promise<MangaPage> {
  const result = await api<{ data: SeriesItem[]; meta?: { page?: number; lastPage?: number } | null }>(
    withQuery(`${API_URL}/series`, { includeMeta: 'true', take: '30', ...params }),
  );
  return {
    items: result.data.map((item) => {
      const { url, title, thumbnailUrl } = toDetails(item);
      return { url, title, thumbnailUrl };
    }),
    hasNextPage: result.meta ? (result.meta.page ?? 0) < (result.meta.lastPage ?? 0) : false,
  };
}

const slugOf = (url: string) => url.split('/').filter(Boolean)[1] ?? '';
const option = (label: string, value: string) => ({ label, value });

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    getPopular: (page) => series({ page: String(page), sort: 'popularity', sortOrder: 'desc' }),

    getLatest: (page) => series({ page: String(page), sort: 'latest', sortOrder: 'desc' }),

    search(query: string, page: number, state: FilterState): Promise<MangaPage> {
      const text = (id: string) => (typeof state[id] === 'string' && state[id] ? (state[id] as string) : undefined);
      const genres = Object.entries(state)
        .filter(([id, value]) => id.startsWith('genre.') && value === true)
        .map(([id]) => `genreIds==${id.slice(6)}`);
      return series({
        page: String(page),
        title: query.trim() || undefined,
        filter: genres.length > 0 ? genres.join(';') : undefined,
        sort: text('sort'),
        sortOrder: text('sortOrder') ?? 'desc',
        status: text('status'),
        format: text('format'),
        type: text('type'),
      });
    },

    async getFilters(): Promise<Filter[]> {
      const filters: Filter[] = [
        {
          type: 'select',
          id: 'sort',
          label: 'Sort',
          options: [
            option('Popular', 'popularity'),
            option('Terbaru', 'latest'),
            option('Rating', 'rating'),
            option('A-Z', 'title'),
          ],
        },
        {
          type: 'select',
          id: 'sortOrder',
          label: 'Sort Order',
          options: [option('Desc', 'desc'), option('Asc', 'asc')],
          default: 'desc',
        },
        {
          type: 'select',
          id: 'status',
          label: 'Status',
          options: [
            option('Any', ''),
            option('On Going', 'ongoing'),
            option('Completed', 'completed'),
            option('Hiatus', 'hiatus'),
            option('Cancelled', 'cancelled'),
          ],
        },
        {
          type: 'select',
          id: 'format',
          label: 'Format',
          options: [
            option('Any', ''),
            ...['Manga', 'Manhwa', 'Manhua', 'Webtoon'].map((f) => option(f, f.toLowerCase())),
          ],
        },
        {
          type: 'select',
          id: 'type',
          label: 'Type',
          options: [option('Any', ''), option('Project', 'project'), option('Mirror', 'mirror')],
        },
      ];
      try {
        const genres = (await api<{ data: { id: number; data: { name: string } }[] }>(`${API_URL}/genres`)).data;
        if (genres.length > 0) {
          filters.push({
            type: 'group',
            id: 'genre',
            label: 'Genre',
            filters: genres.map((g) => ({ type: 'checkbox', id: `genre.${g.id}`, label: g.data.name })),
          });
        }
      } catch (error) {
        log.warn('Cannot load genres', error);
      }
      return filters;
    },

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      return toDetails((await api<{ data: SeriesItem }>(`${API_URL}/series/${slugOf(manga.url)}`)).data);
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const slug = slugOf(manga.url);
      const { data } = await api<{ data: ChapterItem[] }>(`${API_URL}/series/${slug}/chapters`);
      return data.map((c) => {
        const index = c.data.index ?? c.chapterIndex ?? 0;
        const label = String(index).replace(/\.0$/, '');
        const time = Date.parse(c.createdAt ?? c.updatedAt ?? '');
        return {
          url: `/series/${slug}/chapter/${label}`,
          name: c.data.title?.trim() ? `Chapter ${label}: ${c.data.title}` : `Chapter ${label}`,
          number: index,
          uploadedAt: Number.isFinite(time) ? time : undefined,
        };
      });
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const [, slug, , index] = chapter.url.split('/').filter(Boolean);
      const { data } = await api<{ data: ChapterItem }>(`${API_URL}/series/${slug}/chapters/${index}`);
      return (data.data.images ?? []).map((imageUrl, i) => ({ index: i, imageUrl }));
    },

    imageHeaders: () => ({
      'User-Agent': USER_AGENT,
      Referer: `${BASE_URL}/`,
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    }),

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:[^/]+\.)?voratoon\.com\/series\/([^/?#]+)/i.exec(url.trim());
      return match ? { url: `/series/${match[1]}`, title: '' } : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
