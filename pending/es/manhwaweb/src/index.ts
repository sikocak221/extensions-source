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
import { FILTERS, GENRES } from './filters';

const BASE_URL = 'https://manhwaweb.com';
const API_URL = 'https://manhwawebbackend-production.up.railway.app';
const headers = {
  'User-Agent': USER_AGENT,
  Referer: `${BASE_URL}/`,
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/png,image/svg+xml,*/*;q=0.8',
};

async function api<T>(path: string): Promise<T> {
  return (await http.get<T>(API_URL + path, { headers, responseType: 'json' })).body;
}

interface Comic {
  slug: string;
  title: string;
  thumbnail: string;
  order: number;
}

function toPage(comics: Comic[]): MangaPage {
  const seen = new Set<string>();
  const items = comics
    .sort((a, b) => b.order - a.order)
    .filter((c) => !seen.has(c.slug) && Boolean(seen.add(c.slug)))
    .map((c) => ({ url: `/manhwa/${c.slug}`, title: c.title, thumbnailUrl: c.thumbnail }));
  return { items, hasNextPage: false };
}

interface ChapterDto {
  chapter: number;
  link_raw?: string | null;
  link?: string | null;
  create?: number | null;
  versions?: { link?: string | null; create?: number | null }[] | null;
}

interface ComicDetails {
  _id: string;
  real_id: string;
  name_esp: string;
  _sinopsis?: string | null;
  _status: string;
  _name?: string | null;
  _imagen: string;
  _categoris: Record<string, string>[];
  _extras: { autores: string[] };
  chapters: ChapterDto[];
}

const slugOf = (url: string) => url.replace(/\/$/, '').split('/').pop() ?? '';

const STATUS: Record<string, MangaStatus> = { publicandose: 'ongoing', finalizado: 'completed' };

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      type Popular = { link: string; numero: number; name: string; imagen: string };
      const result = await api<{ top: { manhwas_esp: Popular[]; manhwas_raw: Popular[] } }>('/manhwa/nuevos');
      return toPage(
        [...result.top.manhwas_esp, ...result.top.manhwas_raw].map((c) => ({
          slug: slugOf(c.link.replace(/^\//, '').replace('manga/', 'manhwa/')),
          title: c.name,
          thumbnail: c.imagen,
          order: c.numero,
        })),
      );
    },
    async getLatest(): Promise<MangaPage> {
      type Latest = { create: number; id_rel: string; name_manhwa: string; img: string };
      const result = await api<{ manhwas: { manhwas_esp: Latest[]; manhwas_raw: Latest[]; _manhwas: Latest[] } }>(
        '/latest/new-manhwa',
      );
      const { manhwas_esp, manhwas_raw, _manhwas } = result.manhwas;
      return toPage(
        [...manhwas_esp, ...manhwas_raw, ..._manhwas].map((c) => ({
          slug: c.id_rel,
          title: c.name_manhwa,
          thumbnail: c.img,
          order: c.create,
        })),
      );
    },
    getFilters: (): Filter[] => [
      ...FILTERS,
      {
        type: 'group',
        id: 'genres',
        label: 'Géneros',
        filters: GENRES.map(([label, id]): Filter => ({ type: 'checkbox', id: `genre.${id}`, label })),
      },
      {
        type: 'sort',
        id: 'sort',
        label: 'Ordenar por',
        options: [
          { label: 'Alfabético', value: 'alfabetico' },
          { label: 'Creación', value: 'creacion' },
          { label: 'Num. Capítulos', value: 'num_chapter' },
        ],
        default: { value: 'alfabetico', ascending: false },
      },
    ],
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const value = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');
      const genres = Object.entries(filters)
        .filter(([id, v]) => id.startsWith('genre.') && v === true)
        .map(([id]) => id.slice(6))
        .join('a');
      const sort = filters.sort as { value?: string; ascending?: boolean } | undefined;
      const params = {
        buscar: query,
        tipo: value('type'),
        demografia: value('demography'),
        estado: value('status'),
        erotico: value('erotic'),
        generes: genres,
        order_dir: sort?.ascending ? 'asc' : 'desc',
        order_item: sort?.value || 'alfabetico',
        page: String(page - 1),
      };
      const query2 = Object.entries(params)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&');
      const result = await api<{
        data: { real_id: string; the_real_name: string; _imagen: string }[];
        next: boolean;
      }>(`/manhwa/library?${query2}`);
      return {
        items: result.data.map((c) => ({
          url: `/manhwa/${c.real_id}`,
          title: c.the_real_name,
          thumbnailUrl: c._imagen,
        })),
        hasNextPage: result.next,
      };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const dto = await api<ComicDetails>(`/manhwa/see/${slugOf(manga.url)}`);
      const description = [dto._sinopsis, dto._name?.trim() ? `Nombres alternativos: ${dto._name}` : '']
        .filter(Boolean)
        .join('\n\n');
      return {
        url: `/manhwa/${dto.real_id}`,
        title: dto.name_esp,
        thumbnailUrl: dto._imagen,
        description: description || undefined,
        status: STATUS[dto._status] ?? 'unknown',
        genres: dto._categoris.map((c) => Object.values(c)[0] ?? '').filter(Boolean),
        author: dto._extras.autores.join(', ') || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const dto = await api<ComicDetails>(`/manhwa/see/${slugOf(manga.url)}`);
      return dto.chapters
        .flatMap((c): Chapter[] => {
          const esp = c.link ?? c.versions?.[0]?.link ?? undefined;
          const created = c.create ?? c.versions?.[0]?.create ?? undefined;
          const link = esp ?? c.link_raw;
          if (!created || !link) return [];
          return [
            {
              url: link.replace(dto._id, dto.real_id).replace(/^https?:\/\/[^/]+/, ''),
              name: `Capítulo ${c.chapter}`,
              number: c.chapter,
              scanlator: esp ? 'Esp' : 'Raw',
              uploadedAt: created,
            },
          ];
        })
        .sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const result = await api<{ chapter: { img: string[] } }>(`/chapters/see/${slugOf(chapter.url)}`);
      return result.chapter.img.filter((img) => img.startsWith('http')).map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/(?:manhwa|manga)\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/manhwa/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
