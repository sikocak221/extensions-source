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

const BASE_URL = 'https://risentoons.xyz';
const API_URL = `${BASE_URL}/api`;
// The API rejects requests without this client signature.
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, 'X-Rip-Client': 'V6' };

interface MangaDto {
  slug: string;
  title: string;
  cover_image?: string | null;
  synopsis?: string | null;
  author?: string | null;
  artist?: string | null;
  genres?: string[];
  status?: string | null;
  alternative_names?: { name: string }[];
}

async function api<T>(path: string): Promise<T> {
  return (await http.get<T>(API_URL + path, { headers, responseType: 'json' })).body;
}

const STATUS: Record<string, MangaStatus> = {
  ongoing: 'ongoing',
  completed: 'completed',
  hiatus: 'hiatus',
  dropped: 'cancelled',
};

const slugOf = (url: string) => url.replace(/^\/manga\//, '');

const toDetails = (m: MangaDto): MangaDetails => {
  let description = m.synopsis ?? '';
  if (m.alternative_names?.length) {
    if (description) description += '\n\n';
    description += `Nomes alternativos:\n${m.alternative_names.map((n) => `• ${n.name}`).join('\n')}`;
  }
  return {
    url: `/manga/${m.slug}`,
    title: m.title,
    thumbnailUrl: m.cover_image ? BASE_URL + m.cover_image : undefined,
    author: m.author?.trim() || undefined,
    artist: m.artist?.trim() || undefined,
    genres: m.genres ?? [],
    description: description || undefined,
    status: STATUS[m.status ?? ''] ?? 'unknown',
  };
};

async function list(page: number, extra: string[]): Promise<MangaPage> {
  const result = await api<{ data: MangaDto[]; page: number; limit: number; total: number }>(
    `/mangas?limit=24&page=${page}${extra.map((p) => `&${p}`).join('')}`,
  );
  return { items: result.data.map(toDetails), hasNextPage: result.page * result.limit < result.total };
}

const select = (id: string, label: string, options: [string, string][]): Filter => ({
  type: 'select',
  id,
  label,
  default: '',
  options: options.map(([l, value]) => ({ label: l, value })),
});

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(page, ['sort=views']),
    getLatest: (page) => list(page, []),
    async getFilters(): Promise<Filter[]> {
      const genres = await api<{ data: { name: string }[] }>('/genres')
        .then((r) => r.data.map((g) => g.name))
        .catch(() => [] as string[]);
      return [
        select('sort', 'Ordenar por', [
          ['Atualizados', ''],
          ['Populares', 'views'],
          ['Avaliação', 'rating'],
          ['Título', 'title'],
          ['Adicionados', 'created_at'],
        ]),
        select('type_filter', 'Tipo', [
          ['Todos', ''],
          ['Mangá', 'manga'],
          ['Manhwa', 'manhwa'],
          ['Manhua', 'manhua'],
        ]),
        select('status', 'Status', [
          ['Todos', ''],
          ['Em andamento', 'ongoing'],
          ['Completo', 'completed'],
          ['Hiato', 'hiatus'],
          ['Cancelado', 'dropped'],
        ]),
        ...(genres.length
          ? [
              {
                type: 'group' as const,
                id: 'genres',
                label: 'Gêneros',
                filters: genres.map((g): Filter => ({ type: 'checkbox', id: `genre.${g}`, label: g })),
              },
            ]
          : []),
      ];
    },
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params: string[] = [];
      if (query.trim()) params.push(`search=${encodeURIComponent(query.trim())}`);
      for (const key of ['sort', 'type_filter', 'status']) {
        const v = filters[key];
        if (typeof v === 'string' && v) params.push(`${key}=${encodeURIComponent(v)}`);
      }
      const genres = Object.entries(filters)
        .filter(([id, v]) => id.startsWith('genre.') && v === true)
        .map(([id]) => id.slice(6));
      if (genres.length) params.push(`genres=${encodeURIComponent(genres.join(','))}`);
      return list(page, params);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      return toDetails((await api<{ data: MangaDto }>(`/mangas/${slugOf(manga.url)}`)).data);
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const result = await api<{
        chapters: { id: string; number: number; title?: string | null; created_at?: string | null }[];
      }>(`/mangas/${slugOf(manga.url)}/chapters?order=desc`);
      return result.chapters.map((c) => {
        const number = String(c.number).replace(/\.0$/, '');
        // Times are ISO local date-times, read as UTC.
        const time = c.created_at
          ? Date.parse(/Z|[+-]\d\d:?\d\d$/.test(c.created_at) ? c.created_at : `${c.created_at}Z`)
          : Number.NaN;
        return {
          url: `/biblioteca/${slugOf(manga.url)}/${number}/read?chapter=${c.id}`,
          name: c.title?.trim() || `Capítulo ${number}`,
          number: c.number,
          uploadedAt: Number.isNaN(time) ? undefined : time,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const id = /[?&]chapter=([^&]+)/.exec(chapter.url)?.[1] ?? '';
      const result = await api<{ pages: { page_number: number; image_url: string }[] }>(`/mangas/chapters/${id}/pages`);
      return [...result.pages]
        .sort((a, b) => a.page_number - b.page_number)
        .map((p, index) => ({ index, imageUrl: BASE_URL + p.image_url }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/(?:manga|biblioteca)\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/manga/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
