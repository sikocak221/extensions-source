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

const BASE_URL = 'https://shademanga.com';
const MAX_RESULTS = 120;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const ADULT_GENRES = [
  'Ahegao', 'Anal', 'Bañador', 'Bondage', 'Control mental', 'Creampie', 'DILF', 'Doble penetración', 'Embarazada',
  'Enfermera', 'Femdom', 'Footjob', 'Futanari', 'Gafas', 'Grupal', 'Gyaru', 'Harén', 'Incesto', 'Infidelidad',
  'Juguetes', 'Lactancia', 'MILF', 'Maid', 'Medias', 'Mind break', 'Musculosa', 'Netorare', 'Netorase', 'Non-con',
  'Oral', 'Paizuri', 'Pechos enormes', 'Pechos grandes', 'Piel morena', 'Preñez', 'Primera vez', 'Profesora', 'Tomboy',
  'Trasero grande', 'Uniforme escolar', 'Yaoi', 'Yuri',
]; // prettier-ignore

interface Series {
  id: number;
  titulo: string;
  portadaUrl?: string | null;
  descripcion?: string | null;
  autor?: string | null;
  generos?: string | null;
  estado?: string | null;
  capitulos?: { id: number; numeroCapitulo: number; titulo?: string | null; fechaSubida?: string | null }[];
}

interface AdultItem {
  id?: number;
  titulo: string;
  portadaUrl?: string | null;
  generos?: string | null;
  externo?: boolean;
  smId?: number | null;
}

interface AdultCatalog {
  items?: AdultItem[];
  page?: number;
  totalPages?: number;
  pageTokens?: { next?: string | null } | null;
}

interface Oneshot {
  smId: number;
  titulo: string;
  autor?: string | null;
  descripcion?: string | null;
  generos?: string | null;
  portadaUrl?: string | null;
  capituloId?: number;
}

async function api<T>(path: string): Promise<T> {
  return (await http.get<T>(BASE_URL + path, { headers, responseType: 'json' })).body;
}

const genreList = (genres: string | null | undefined) =>
  (genres ?? '')
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean);

// Manga urls: `/serie/local/<id>` for the site's own series, `/adultos/manga/o/<smId>` for external oneshots.
const seriesSummary = (s: Series): MangaSummary => ({
  url: `/serie/local/${s.id}`,
  title: s.titulo,
  thumbnailUrl: s.portadaUrl || undefined,
});
const adultSummary = (item: AdultItem): MangaSummary => ({
  url: (item.externo || !item.id) && item.smId != null ? `/adultos/manga/o/${item.smId}` : `/serie/local/${item.id}`,
  title: item.titulo,
  thumbnailUrl: item.portadaUrl || undefined,
});

/** The adult catalog pages by a token: base64url of {"lo":n,"so":n}, n = (page-1) * pageSize/2. */
function adultPageToken(page: number, pageSize: number): string {
  const offset = (page - 1) * (pageSize / 2);
  return `cx_${base64.encode(`{"lo":${offset},"so":${offset}}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

async function adultCatalog(page: number, params: Record<string, string>, pageSize: number, externals: boolean) {
  const query = Object.entries({
    ...params,
    pageSize: String(pageSize),
    ...(page > 1 ? { p: adultPageToken(page, pageSize) } : {}),
  })
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  const result = await api<AdultCatalog>(`/api/series-locales/adultos?${query}`);
  const items = (result.items ?? []).filter((item) => externals || !item.externo);
  return {
    items,
    hasNextPage:
      items.length > 0 && (Boolean(result.pageTokens?.next) || (result.page ?? 1) < (result.totalPages ?? 1)),
  };
}

const STATUS: Record<string, MangaStatus> = { 'en curso': 'ongoing', completado: 'completed', pausada: 'hiatus' };

// media.shademanga.com doesn't answer; cdn.shademanga.com serves the same paths.
const imageUrl = (url: string) => url.replace('://media.shademanga.com/', '://cdn.shademanga.com/');

export default defineExtension({
  createSource: ({ key }) => {
    const adult = key === 'adult';
    return {
      baseUrl: BASE_URL,
      async getPopular(page: number): Promise<MangaPage> {
        if (adult) {
          const result = await adultCatalog(page, { orden: 'vistos' }, 48, false);
          return { items: result.items.map(adultSummary), hasNextPage: result.hasNextPage };
        }
        const result = await api<{ series: Series[] }[]>('/api/series-locales/popular');
        const seen = new Set<number>();
        const items = result
          .flatMap((group) => group.series)
          .filter((s) => !seen.has(s.id) && Boolean(seen.add(s.id)))
          .map(seriesSummary);
        return { items, hasNextPage: false };
      },
      async getLatest(page: number): Promise<MangaPage> {
        if (adult) {
          const result = await adultCatalog(page, { orden: 'recientes' }, 48, false);
          return { items: result.items.map(adultSummary), hasNextPage: result.hasNextPage };
        }
        const result = await api<{ items: { serie: Series }[]; page: number; totalPages: number }>(
          `/api/series-locales/capitulos/recientes?page=${page}&pageSize=24`,
        );
        const seen = new Set<number>();
        const items = result.items
          .map((item) => item.serie)
          .filter((s) => !seen.has(s.id) && Boolean(seen.add(s.id)))
          .map(seriesSummary);
        return { items, hasNextPage: result.page < result.totalPages };
      },
      async getFilters(): Promise<Filter[]> {
        const genres = adult ? ADULT_GENRES : (await api<string[]>('/api/series-locales/tags').catch(() => [])).sort();
        return [
          ...(adult
            ? [
                {
                  type: 'select' as const,
                  id: 'order',
                  label: 'Orden',
                  default: 'recientes',
                  options: [
                    { label: 'Recientes', value: 'recientes' },
                    { label: 'Más vistos', value: 'vistos' },
                    { label: 'A-Z', value: 'az' },
                  ],
                },
              ]
            : []),
          {
            type: 'group',
            id: 'genres',
            label: 'Géneros',
            filters: genres.map((g): Filter => ({ type: 'tristate', id: `genre.${g}`, label: g })),
          },
        ];
      },
      async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
        const genres = (state: string) =>
          Object.entries(filters)
            .filter(([id, value]) => id.startsWith('genre.') && value === state)
            .map(([id]) => id.slice(6));
        const included = genres('include');
        const excluded = genres('exclude');
        const allowed = (list: string | null | undefined) => !genreList(list).some((g) => excluded.includes(g));
        if (adult) {
          const params: Record<string, string> = {};
          if (query.trim()) params.q = query;
          if (included.length) params.generos = included.join(',');
          const order = typeof filters.order === 'string' ? filters.order : 'recientes';
          if (order !== 'recientes') params.orden = order;
          const result = await adultCatalog(page, params, 24, true);
          return {
            items: result.items.filter((i) => allowed(i.generos)).map(adultSummary),
            hasNextPage: result.hasNextPage,
          };
        }
        const params = [
          `q=${encodeURIComponent(query)}`,
          'includeAdult=false',
          'showSinPortada=false',
          `take=${MAX_RESULTS}`,
          ...included.map((g) => `tags=${encodeURIComponent(g)}`),
        ];
        const result = await api<Series[]>(`/api/series-locales/search-candidates?${params.join('&')}`);
        return {
          items: result
            .filter((s) => allowed(s.generos))
            .sort((a, b) => a.titulo.localeCompare(b.titulo))
            .map(seriesSummary),
          hasNextPage: false,
        };
      },
      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        const oneshot = /^\/adultos\/manga\/o\/(\d+)/.exec(manga.url)?.[1];
        if (oneshot) {
          const o = await api<Oneshot>(`/api/series-locales/ext/${oneshot}`);
          return {
            url: manga.url,
            title: o.titulo,
            thumbnailUrl: o.portadaUrl || undefined,
            description: o.descripcion || undefined,
            author: o.autor || undefined,
            genres: genreList(o.generos),
            status: 'completed',
          };
        }
        const s = await api<Series>(`/api/series-locales/${manga.url.split('/').pop()}`);
        return {
          ...seriesSummary(s),
          description: s.descripcion || undefined,
          author: s.autor || undefined,
          genres: genreList(s.generos),
          status: STATUS[s.estado?.toLowerCase() ?? ''] ?? 'unknown',
        };
      },
      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        const oneshot = /^\/adultos\/manga\/o\/(\d+)/.exec(manga.url)?.[1];
        if (oneshot) {
          const o = await api<Oneshot>(`/api/series-locales/ext/${oneshot}`);
          return [{ url: `/ext/${o.smId}/${o.capituloId ?? 1}`, name: 'Capítulo 1' }];
        }
        const s = await api<Series>(`/api/series-locales/${manga.url.split('/').pop()}`);
        return (s.capitulos ?? [])
          .sort((a, b) => b.numeroCapitulo - a.numeroCapitulo)
          .map((c) => {
            const time = c.fechaSubida ? Date.parse(c.fechaSubida) : Number.NaN;
            return {
              url: `/${s.id}/${c.id}`,
              name: `Cap. ${c.numeroCapitulo}${c.titulo ? ` - ${c.titulo}` : ''}`,
              number: c.numeroCapitulo,
              uploadedAt: Number.isNaN(time) ? undefined : time,
            };
          });
      },
      async getPages(chapter: Chapter): Promise<Page[]> {
        const ext = /^\/ext\/(\d+)/.exec(chapter.url)?.[1];
        const [, mangaId, chapterId] = /^\/(\d+)\/(\d+)/.exec(chapter.url) ?? [];
        const path = ext
          ? `/api/series-locales/ext/${ext}/paginas`
          : `/api/series-locales/${mangaId}/capitulos/${chapterId}/paginas`;
        const result = await api<{ paginas: string[] }>(path);
        return result.paginas.map((url, index) => ({ index, imageUrl: imageUrl(url) }));
      },
      imageHeaders: () => headers,
      resolveUrl(url: string): MangaSummary | null {
        const match = /^https?:\/\/([^/?#]+)(\/serie\/local\/\d+|\/adultos\/manga\/o\/\d+)/i.exec(url.trim());
        return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
      },
      getWebUrl: (item) => BASE_URL + item.url,
    };
  },
});
