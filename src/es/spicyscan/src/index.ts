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
import { GROUPS } from './filters';

const BASE_URL = 'https://spicyseries.com';
const API_URL = 'https://back.spicyseries.com';
const PAGE_SIZE = 12;
const SORT_POPULAR = '6';
const SORT_LATEST = '3';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface MangaDto {
  name: string;
  slug: string;
  sinopsis?: string | null;
  urlImg: string;
  stateId?: number | null;
  genders?: { name: string }[] | null;
  chapters?: { num: number; slug: string; createdAt: string }[] | null;
}

async function api<T>(path: string): Promise<T> {
  return (await http.get<T>(API_URL + path, { headers, responseType: 'json' })).body;
}

const summary = (m: MangaDto): MangaSummary => ({ url: `/comic/${m.slug}`, title: m.name, thumbnailUrl: m.urlImg });
const slugOf = (url: string) => url.replace(/^\/comic\//, '');

async function filtered(page: number, params: Record<string, string>): Promise<MangaPage> {
  const query = Object.entries({
    page: String(page),
    limit: String(PAGE_SIZE),
    orderBy: SORT_LATEST,
    sort: 'desc',
    gendersId: '',
    origin: '',
    state: '',
    loading: 'true',
    ...params,
  })
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  const result = await api<{ data: MangaDto[]; meta: { current_page: number; last_page: number } }>(
    `/filtrar?${query}`,
  );
  return { items: result.data.map(summary), hasNextPage: result.meta.current_page < result.meta.last_page };
}

const STATUS: Record<number, MangaStatus> = {
  1: 'ongoing',
  2: 'hiatus',
  3: 'cancelled',
  4: 'completed',
  5: 'cancelled',
};

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => filtered(page, { orderBy: SORT_POPULAR }),
    getLatest: (page) => filtered(page, { orderBy: SORT_LATEST }),
    getFilters: (): Filter[] => [
      { type: 'header', label: 'Los filtros no se aplican a la búsqueda por texto' },
      {
        type: 'sort',
        id: 'sort',
        label: 'Ordenar por',
        // "Vistas" (1) is left out: the server answers 500 for it.
        options: [
          { label: 'Nombre', value: '2' },
          { label: 'Actualización', value: '3' },
          { label: 'Recientemente agregados', value: '4' },
          { label: 'N° capítulos', value: '5' },
          { label: 'N° seguidores', value: '6' },
        ],
        default: { value: SORT_LATEST, ascending: false },
      },
      ...GROUPS,
    ],
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query) {
        if (query.length < 2) throw new Error('Escribe al menos 2 caracteres para buscar');
        const result = await api<MangaDto[]>(`/home/buscar?query=${encodeURIComponent(query)}`);
        return { items: result.map(summary), hasNextPage: false };
      }
      const params: Record<string, string> = {};
      const sort = filters.sort as { value?: string; ascending?: boolean } | undefined;
      params.orderBy = sort?.value || SORT_LATEST;
      params.sort = sort?.ascending ? 'asc' : 'desc';
      for (const group of ['gendersId', 'state', 'origin']) {
        const values = Object.entries(filters)
          .filter(([id, value]) => id.startsWith(`${group}.`) && value === true)
          .map(([id]) => id.slice(group.length + 1));
        if (values.length) params[group] = values.join(',');
      }
      return filtered(page, params);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { serie } = await api<{ serie: MangaDto }>(`/serie/${slugOf(manga.url)}`);
      return {
        ...summary(serie),
        description: serie.sinopsis || undefined,
        status: (serie.stateId != null && STATUS[serie.stateId]) || 'unknown',
        genres: serie.genders?.map((g) => g.name) ?? [],
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { serie } = await api<{ serie: MangaDto }>(`/serie/${slugOf(manga.url)}`);
      return (serie.chapters ?? []).map((c) => {
        const time = Date.parse(c.createdAt);
        return {
          url: `/comic/${serie.slug}/${c.slug}`,
          name: `Capítulo ${c.num}`,
          number: c.num,
          uploadedAt: Number.isNaN(time) ? undefined : time,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const result = await api<{ pageches: { urlImg: string } | { urlImg: string }[] }>(
        `/serie/${slugOf(chapter.url)}/`,
      );
      const pages = Array.isArray(result.pageches) ? result.pageches[0] : result.pageches;
      return (JSON.parse(pages?.urlImg ?? '[]') as string[]).map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/comic\/([^/?#]+)\/?(?:[?#]|$)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/comic/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
