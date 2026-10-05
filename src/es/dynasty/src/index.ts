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

const BASE_URL = 'https://manhuako.net';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, Accept: 'application/json, text/plain, */*' };

const GENRES: [string, string][] = [
  ['Todos', ''],
  ['Acción', 'accion'],
  ['Artes Marciales', 'artes-marciales'],
  ['Aventura', 'aventura'],
  ['BL', 'bl'],
  ['Ciencia Ficción', 'ciencia-ficcion'],
  ['Comedia', 'comedia'],
  ['Deportes', 'deportes'],
  ['Drama', 'drama'],
  ['Ecchi', 'ecchi'],
  ['Escolar', 'escolar'],
  ['Fantasía', 'fantasia'],
  ['Harem', 'harem'],
  ['HFY', 'humanity-fvck-yeah'],
  ['Horror', 'horror'],
  ['Isekai', 'isekai'],
  ['Kingdom building', 'kingdom-building'],
  ['Mecha', 'mecha'],
  ['Misterio', 'misterio'],
  ['Murim', 'murim'],
  ['Psicológico', 'psicologico'],
  ['Reencarnación', 'reencarnacion'],
  ['Romance', 'romance'],
  ['Seinen', 'seinen'],
  ['Shounen', 'shounen'],
  ['Sistemas', 'sistemas'],
  ['Slice of Life', 'slice-of-life'],
  ['Sobrenatural', 'sobrenatural'],
  ['Tragedia', 'tragedia'],
  ['Xianxia', 'xianxia'],
  ['Xuanhuan', 'xuanhuan'],
  ['Yuri', 'yuri'],
];

interface MangaDto {
  id: number;
  title: string;
  slug: string;
  description?: string | null;
  cover_image?: string | null;
  author?: string | null;
  artist?: string | null;
  status?: string | null;
  type?: string | null;
  views?: number | null;
  rating?: number | null;
  updated_at?: string | null;
}

interface ChapterDto {
  id: number;
  number?: number | null;
  title?: string | null;
  created_at?: string | null;
}

async function api<T>(path: string): Promise<T> {
  return (await http.get<T>(`${BASE_URL}/api${path}`, { headers, responseType: 'json' })).body;
}

const time = (value: string | null | undefined) => {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? undefined : parsed;
};

const slugOf = (url: string) => url.replace(/^\/manga\//, '').replace(/[/?#].*$/, '');

/** `/api/mangas/<slug>` answers like `/api/mangas/<id>`; chapters need the numeric id. */
async function fetchManga(url: string): Promise<MangaDto> {
  const json = await api<MangaDto | { data: MangaDto }>(`/mangas/${encodeURIComponent(slugOf(url))}`);
  return 'data' in json ? json.data : json;
}

function summary(manga: MangaDto): MangaSummary {
  return { url: `/manga/${manga.slug}`, title: manga.title, thumbnailUrl: manga.cover_image || undefined };
}

const SORTS: Record<string, (a: MangaDto, b: MangaDto) => number> = {
  popular: (a, b) => (b.views ?? 0) - (a.views ?? 0),
  newest: (a, b) => (time(b.updated_at) ?? 0) - (time(a.updated_at) ?? 0),
  rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
  az: (a, b) => a.title.localeCompare(b.title),
};

async function mangaPage(page: number, params: Record<string, string>): Promise<MangaPage> {
  const query = Object.entries({ page: String(page), limit: '20', ...params })
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  const result = await api<{ data?: MangaDto[]; totalPages?: number }>(`/mangas?${query}`);
  const mangas = (result.data ?? []).filter((m) => !m.type?.toLowerCase().includes('novel'));
  const sort = params.sort ? SORTS[params.sort] : undefined;
  if (sort) mangas.sort(sort);
  return { items: mangas.map(summary), hasNextPage: page < (result.totalPages ?? 1) };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => mangaPage(page, { sort: 'popular' }),
    getLatest: (page) => mangaPage(page, { sort: 'newest' }),
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'sort',
        label: 'Ordenar por',
        default: 'newest',
        options: [
          { label: 'Recientes', value: 'newest' },
          { label: 'Populares', value: 'popular' },
          { label: 'Valorados', value: 'rating' },
          { label: 'A - Z', value: 'az' },
        ],
      },
      {
        type: 'select',
        id: 'genre',
        label: 'Género (Ignorado si hay texto en la búsqueda)',
        default: '',
        options: GENRES.map(([label, value]) => ({ label, value })),
      },
    ],
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params: Record<string, string> = {};
      if (query.trim()) params.search = query.trim();
      else if (typeof filters.genre === 'string' && filters.genre) params.genre = filters.genre;
      params.sort = typeof filters.sort === 'string' && filters.sort ? filters.sort : 'newest';
      return mangaPage(page, params);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const dto = await fetchManga(manga.url);
      const status: MangaStatus =
        dto.status === 'ongoing'
          ? 'ongoing'
          : dto.status === 'completed'
            ? 'completed'
            : dto.status === 'hiatus'
              ? 'hiatus'
              : 'unknown';
      return {
        ...summary(dto),
        description: dto.description || undefined,
        author: dto.author?.trim() || undefined,
        artist: dto.artist?.trim() || undefined,
        genres: dto.type ? [dto.type.charAt(0).toUpperCase() + dto.type.slice(1)] : [],
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { id } = await fetchManga(manga.url);
      const chapters: Chapter[] = [];
      for (let page = 1, total = 1; page <= total; page++) {
        const result = await api<{ chapters?: ChapterDto[]; totalPages?: number }>(
          `/chapters/paginated?manga_id=${id}&page=${page}&limit=100&sort=desc`,
        );
        total = result.totalPages ?? 1;
        for (const c of result.chapters ?? []) {
          const title = c.title && c.title !== 'null' ? c.title.trim() : '';
          const number = c.number != null ? `Capítulo ${c.number}` : '';
          chapters.push({
            url: `/api/chapter-pages?chapter_id=${c.id}`,
            name: [number, title].filter(Boolean).join(' - ') || 'Capítulo',
            number: c.number ?? undefined,
            uploadedAt: time(c.created_at),
          });
        }
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const pages = (await http.get<{ image_url: string }[]>(BASE_URL + chapter.url, { headers, responseType: 'json' }))
        .body;
      return pages.map((page, index) => ({ index, imageUrl: page.image_url }));
    },
    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/manga\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/manga/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
