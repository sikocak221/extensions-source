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
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://lector-mangas.lat';
const API_HOST = 'api.zerocomics.net';
const API_URL = `https://${API_HOST}/api`;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface SeriesDto {
  id: number;
  slug: string;
  titulo: string;
  titulo_alternativo?: string | null;
  sinopsis?: string | null;
  portada?: string | null;
  tipo?: string | null;
  estado?: string | null;
  generos?: string[];
  grupo?: { nombre: string } | null;
  capitulos?: { id: number; numero: string | number; titulo?: string | null; publicado_en?: string | null }[];
}

const SORTS: [string, string][] = [
  ['Actualización', ''],
  ['Popularidad', 'views'],
  ['Valoración', 'rating'],
  ['Recientes', 'created_at'],
];

const STATUSES: [string, string][] = [
  ['Todos', ''],
  ['En emisión', 'En emisión'],
  ['Finalizado', 'Finalizado'],
];

const get = async <T>(url: string): Promise<T> => JSON.parse((await http.get(url, { headers })).body) as T;

// Manga urls are the series slug (the id is not enough to open the series).
const toSummary = (s: SeriesDto): MangaSummary => ({
  url: `/comics/${s.slug}`,
  title: s.titulo,
  thumbnailUrl: s.portada || undefined,
});

const slugOf = (url: string) => url.substring(url.lastIndexOf('/') + 1);

async function search(page: number, query: string, sort?: string, status?: string): Promise<MangaPage> {
  const params: string[] = [];
  if (query.trim()) params.push(`q=${encodeURIComponent(query)}`);
  if (sort) params.push(`sort=${encodeURIComponent(sort)}`);
  if (status) params.push(`estado=${encodeURIComponent(status)}`);
  params.push(`page=${page}`);
  const result = await get<{ data: SeriesDto[]; meta?: { current_page: number; last_page: number } | null }>(
    `${API_URL}/series?${params.join('&')}`,
  );
  // The API lists some broken entries without a slug; the meta is omitted when all results fit on one page.
  return {
    items: result.data.filter((s) => s.slug).map(toSummary),
    hasNextPage: !!result.meta && result.meta.current_page < result.meta.last_page,
  };
}

function toStatus(estado: string | null | undefined): MangaStatus {
  switch (estado?.toLowerCase()) {
    case 'en emisión':
      return 'ongoing';
    case 'finalizado':
      return 'completed';
    default:
      return 'unknown';
  }
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => search(page, '', 'views'),
    getLatest: (page) => search(page, ''),
    search: (query, page, filters: FilterState) =>
      search(page, query, (filters.sort as string) || undefined, (filters.status as string) || undefined),
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'sort',
        label: 'Ordenar por',
        options: SORTS.map(([label, value]) => ({ label, value })),
        default: 'views',
      },
      {
        type: 'select',
        id: 'status',
        label: 'Estado',
        options: STATUSES.map(([label, value]) => ({ label, value })),
        default: '',
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const s = (await get<{ data: SeriesDto }>(`${API_URL}/series/${slugOf(manga.url)}`)).data;
      const description = [
        s.sinopsis,
        s.titulo_alternativo?.trim() ? `Nombres alternativos: ${s.titulo_alternativo}` : undefined,
        s.grupo ? `Grupo: ${s.grupo.nombre}` : undefined,
      ]
        .filter(Boolean)
        .join('\n\n');
      return {
        ...toSummary(s),
        genres: [...(s.tipo ? [s.tipo] : []), ...(s.generos ?? [])],
        description: description || undefined,
        status: toStatus(s.estado),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const s = (await get<{ data: SeriesDto }>(`${API_URL}/series/${slugOf(manga.url)}`)).data;
      return (s.capitulos ?? []).map((c) => {
        const number = String(c.numero);
        return {
          // The chapter id opens the pages; the readable address is derived from the series and number.
          url: `/comics/${s.slug}/capitulo-${number}#${c.id}`,
          name: `Capítulo ${number}${c.titulo?.trim() ? ` - ${c.titulo}` : ''}`,
          number: Number.parseFloat(number) || -1,
          uploadedAt: Date.parse(c.publicado_en ?? '') || undefined,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const id = chapter.url.split('#')[1] ?? '';
      const result = await get<{ data: { paginas: string[] } }>(`${API_URL}/capitulos/${id}`);
      return result.data.paginas.map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => `${BASE_URL}${item.url.split('#')[0]}`,
    resolveUrl(url): MangaSummary | null {
      const slug = /^https?:\/\/(?:www\.)?lector-mangas\.lat\/comics\/([^/?#]+)\/?$/i.exec(url)?.[1];
      return slug ? { url: `/comics/${slug}`, title: '' } : null;
    },
  }),
});
