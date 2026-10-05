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

const BASE_URL = 'https://newcatharsis.dig-it.info';
const API_URL = `${BASE_URL}/api`;
const PAGE_SIZE = 24;
const XOR_KEY = 0x43;
const headers = {
  'User-Agent': USER_AGENT,
  Referer: `${BASE_URL}/`,
  'x-api-key': 'SrfnigkBo3YLbySfIE0DU9WtmlF7Ov4mzakJlBV9ZCw',
  System: 'catharsis',
  'X-FK-Sistema': '3',
};

interface MangaDto {
  id: number | string;
  nombre: string;
  portada_url?: string | null;
  descripcion?: string | null;
  estado?: string | null;
  tipo?: string | null;
  nombre_alt_1?: string | null;
  nombre_alt_2?: string | null;
  fk_generos?: { generos_id: { id: string; nombre: string } }[];
  capitulos?: ChapterDto[];
}

interface ChapterDto {
  numero: number;
  titulo?: string | null;
  estado?: string | null;
  fecha_publicacion?: string | null;
  date_created?: string | null;
}

async function api<T>(path: string): Promise<T> {
  return (await http.get<T>(API_URL + path, { headers, responseType: 'json' })).body;
}

function summary(manga: MangaDto): MangaSummary {
  return {
    url: `/manga/${manga.id}`,
    title: manga.nombre,
    thumbnailUrl: manga.portada_url ? `${BASE_URL}/assets/${manga.portada_url}` : undefined,
  };
}

const idOf = (url: string) => /^\/manga\/([^/?#]+)/.exec(url)?.[1] ?? '';
const numberText = (n: number) => String(n).replace(/\.0$/, '');

async function searchMangas(page: number, params: Record<string, string>): Promise<MangaPage> {
  const query = Object.entries({ page: String(page), limit: String(PAGE_SIZE), ...params })
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  const result = await api<{ data: MangaDto[]; total_pages: number }>(`/mangas?${query}`);
  return { items: result.data.map(summary), hasNextPage: page < result.total_pages };
}

const STATUS: Record<string, MangaStatus> = { curso: 'ongoing', pausado: 'hiatus', terminado: 'completed' };

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => searchMangas(page, { sort: '-n_visitas' }),
    getLatest: (page) => searchMangas(page, { sort: '-fecha_ultimo_capitulo' }),
    async getFilters(): Promise<Filter[]> {
      const genres = await api<{ id: string; nombre: string }[]>('/mangas/genres').catch(() => []);
      return [
        {
          type: 'sort',
          id: 'sort',
          label: 'Ordenar por',
          options: [
            { label: 'Última actualización', value: 'fecha_ultimo_capitulo' },
            { label: 'Visitas', value: 'n_visitas' },
            { label: 'Fecha de creación', value: 'date_created' },
            { label: 'Nombre', value: 'nombre' },
          ],
          default: { value: 'fecha_ultimo_capitulo', ascending: false },
        },
        {
          type: 'select',
          id: 'status',
          label: 'Estado',
          default: '',
          options: [
            { label: 'Todos', value: '' },
            { label: 'En emisión', value: 'curso' },
            { label: 'Hiatus', value: 'pausado' },
            { label: 'Terminado', value: 'terminado' },
          ],
        },
        {
          type: 'group',
          id: 'genres',
          label: 'Géneros',
          filters: genres.map((g): Filter => ({ type: 'checkbox', id: `genre.${g.id}`, label: g.nombre })),
        },
      ];
    },
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params: Record<string, string> = {};
      if (query.trim()) params.name = query.trim();
      const genres = Object.entries(filters)
        .filter(([id, value]) => id.startsWith('genre.') && value === true)
        .map(([id]) => id.slice(6));
      if (genres.length) params.genre = genres.join('|');
      if (typeof filters.status === 'string' && filters.status) params.status = filters.status;
      const sort = filters.sort as { value?: string; ascending?: boolean } | undefined;
      params.sort = `${sort?.ascending ? '' : '-'}${sort?.value || 'fecha_ultimo_capitulo'}`;
      return searchMangas(page, params);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const dto = await api<MangaDto>(`/mangas/${idOf(manga.url)}`);
      const altNames = [dto.nombre_alt_1, dto.nombre_alt_2].filter((n): n is string => Boolean(n?.trim()));
      const description = [
        dto.descripcion?.trim(),
        altNames.length ? `Nombres alternativos:\n${altNames.join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      return {
        ...summary(dto),
        description: description || undefined,
        genres: [...(dto.tipo ? [dto.tipo] : []), ...(dto.fk_generos ?? []).map((g) => g.generos_id.nombre)],
        status: STATUS[dto.estado ?? ''] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const id = idOf(manga.url);
      const dto = await api<MangaDto>(`/mangas/${id}`);
      return (dto.capitulos ?? [])
        .filter((c) => !c.estado || c.estado === 'publicado')
        .sort((a, b) => b.numero - a.numero)
        .map((c) => {
          const date = c.fecha_publicacion ?? c.date_created;
          const time = date ? Date.parse(date) : Number.NaN;
          return {
            url: `/manga/${id}/chapter/${numberText(c.numero)}`,
            name: c.titulo?.trim() || `Capítulo ${numberText(c.numero)}`,
            number: c.numero,
            uploadedAt: Number.isNaN(time) ? undefined : time,
          };
        });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [, mangaId, number] = /^\/manga\/([^/]+)\/chapter\/([^/?#]+)/.exec(chapter.url) ?? [];
      const data = await api<{ id: number; paginas: unknown[]; chapterSessionToken?: string }>(
        `/mangas/${mangaId}/${number}`,
      );
      // Each page image needs a short-lived signed ticket, fetched when the page is shown (getImageUrl).
      return data.paginas.map((_, index) => ({
        index,
        url: `${API_URL}/mangas/chapters/${data.id}/page-ticket#${index}:${encodeURIComponent(data.chapterSessionToken ?? '')}`,
      }));
    },
    async getImageUrl(page: Page): Promise<string> {
      const [, ticketUrl, index, token] = /^([^#]+)#(\d+):(.*)$/.exec(page.url ?? '') ?? [];
      const ticket = await http.post<{ signedToken: string }>(
        ticketUrl!,
        { json: { pageIndex: Number(index), sessionToken: decodeURIComponent(token ?? '') } },
        { headers, responseType: 'json' },
      );
      return `${API_URL}/mangas/pages/${ticket.body.signedToken}`;
    },
    imageHeaders: () => headers,
    // Page images are XOR-ed with one byte unless they already start with an image signature.
    transformImage(_page, bytes) {
      if (isImage(bytes, 0)) return {};
      if (!isImage(bytes, XOR_KEY)) return {};
      const out = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) out[i] = bytes[i]! ^ XOR_KEY;
      return { bytes: out };
    },
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/manga\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/manga/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});

function isImage(bytes: Uint8Array, key: number): boolean {
  const b = (i: number) => (bytes[i] ?? 0) ^ key;
  return (
    (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46) ||
    (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) ||
    (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) ||
    (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46) ||
    (b(4) === 0x66 && b(5) === 0x74 && b(6) === 0x79 && b(7) === 0x70)
  );
}
