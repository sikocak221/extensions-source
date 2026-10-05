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
import { GENRES } from './genres';

// Two sites on the same backend: the catalog is one unpaginated /api/comics list, filtered here.
const BASE_URLS: Record<string, string> = {
  scan: 'https://coloresito.site',
  toons: 'https://colorcitotoons.site',
};

const TYPES = ['Manhwa +19', 'Manhwa', 'Manhwa BL', 'Manga', 'Webtoon', 'Manhua', 'Novela'];
const STATUSES: [string, string][] = [
  ['Todos', ''],
  ['En emisión', '1'],
  ['En pausa', '2'],
  ['Abandonado', '3'],
  ['Finalizado', '4'],
  ['Cancelado', '5'],
];

interface Named {
  id?: number | null;
  name?: string | null;
}

interface ComicData {
  name: string;
  slug: string;
  urlImg?: string | null;
  alternativeName?: string | null;
  state_id?: number | null;
  origins?: { origin?: Named | null }[];
  genders?: { gender?: Named | null }[];
  trending?: { visitas?: number } | null;
  actualizacionCap?: string | null;
  averageRating?: number | null;
}

interface ProjectDetails {
  name: string;
  sinopsis?: string | null;
  slug: string;
  urlImg?: string | null;
  state?: { estado?: string | null } | null;
  genders?: { gender?: Named | null }[];
  origins?: { origin?: Named | null }[];
  autors?: Named[];
  artists?: Named[];
  lastChapters?: { num?: string | null; name?: string | null; slug: string; created_at?: string | null }[];
}

const time = (value: string | null | undefined) => {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
};

const STATUS: Record<string, MangaStatus> = {
  'en emision': 'ongoing',
  'en emisión': 'ongoing',
  finalizado: 'completed',
  'en pausa': 'hiatus',
  cancelado: 'cancelled',
  abandonado: 'cancelled',
};

const genresOf = (comic: { genders?: { gender?: Named | null }[] }) =>
  (comic.genders ?? []).map((g) => g.gender?.name?.toLowerCase()).filter((g): g is string => Boolean(g));

export default defineExtension({
  createSource: ({ key }) => {
    const baseUrl = BASE_URLS[key] ?? BASE_URLS.scan!;
    const headers = { 'User-Agent': USER_AGENT, Referer: `${baseUrl}/` };

    async function api<T>(path: string): Promise<T> {
      return (await http.get<T>(baseUrl + path, { headers, responseType: 'json' })).body;
    }

    const comics = async () => (await api<{ response: ComicData[] }>('/api/comics')).response;
    const toPage = (list: ComicData[]): MangaPage => ({
      items: list.map((c) => ({ url: `/ver/${c.slug}`, title: c.name, thumbnailUrl: c.urlImg || undefined })),
      hasNextPage: false,
    });
    const project = async (url: string) =>
      (await api<{ response: ProjectDetails }>(`/api/showProject/${url.replace(/\/$/, '').split('/').pop()}`)).response;

    return {
      baseUrl,
      getPopular: async () =>
        toPage((await comics()).sort((a, b) => (b.trending?.visitas ?? 0) - (a.trending?.visitas ?? 0))),
      getLatest: async () =>
        toPage((await comics()).sort((a, b) => time(b.actualizacionCap) - time(a.actualizacionCap))),
      getFilters: (): Filter[] => [
        {
          type: 'sort',
          id: 'sort',
          label: 'Ordenar por',
          options: [
            { label: 'Popularidad', value: 'popular' },
            { label: 'Actualización', value: 'updated' },
            { label: 'Nombre', value: 'name' },
            { label: 'Valoración', value: 'rating' },
          ],
          default: { value: 'popular', ascending: false },
        },
        {
          type: 'select',
          id: 'status',
          label: 'Estado',
          default: '',
          options: STATUSES.map(([label, value]) => ({ label, value })),
        },
        {
          type: 'select',
          id: 'type',
          label: 'Tipo',
          default: '',
          options: [{ label: 'Todos', value: '' }, ...TYPES.map((t) => ({ label: t, value: t }))],
        },
        { type: 'separator' },
        {
          type: 'group',
          id: 'genres',
          label: 'Géneros',
          filters: GENRES.map((g): Filter => ({ type: 'tristate', id: `genre.${g}`, label: g })),
        },
      ],
      async search(query: string, _page: number, filters: FilterState): Promise<MangaPage> {
        let list = await comics();
        const needle = query.trim().toLowerCase();
        if (needle) {
          list = list.filter((c) => `${c.name} ${c.alternativeName ?? ''}`.toLowerCase().includes(needle));
        }
        if (typeof filters.status === 'string' && filters.status) {
          list = list.filter((c) => String(c.state_id) === filters.status);
        }
        if (typeof filters.type === 'string' && filters.type) {
          const type = filters.type.toLowerCase();
          list = list.filter((c) => (c.origins ?? []).some((o) => o.origin?.name?.toLowerCase() === type));
        }
        const genre = (state: string) =>
          Object.entries(filters)
            .filter(([id, value]) => id.startsWith('genre.') && value === state)
            .map(([id]) => id.slice(6).toLowerCase());
        const included = genre('include');
        const excluded = genre('exclude');
        if (included.length) list = list.filter((c) => included.every((g) => genresOf(c).includes(g)));
        if (excluded.length) list = list.filter((c) => !excluded.some((g) => genresOf(c).includes(g)));
        const sort = filters.sort as { value?: string; ascending?: boolean } | undefined;
        const by: Record<string, (c: ComicData) => number | string> = {
          popular: (c) => c.trending?.visitas ?? 0,
          updated: (c) => time(c.actualizacionCap),
          name: (c) => c.name.toLowerCase(),
          rating: (c) => c.averageRating ?? 0,
        };
        const key = by[sort?.value ?? 'popular'];
        if (key) {
          const direction = sort?.ascending ? 1 : -1;
          list.sort((a, b) => (key(a) > key(b) ? direction : key(a) < key(b) ? -direction : 0));
        }
        return toPage(list);
      },
      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        const p = await project(manga.url);
        const names = (list: Named[] | undefined) =>
          (list ?? [])
            .map((n) => n.name)
            .filter(Boolean)
            .join(', ') || undefined;
        return {
          url: `/ver/${p.slug}`,
          title: p.name,
          thumbnailUrl: p.urlImg || undefined,
          description: p.sinopsis || undefined,
          status: STATUS[p.state?.estado?.toLowerCase() ?? ''] ?? 'unknown',
          genres: [
            ...new Set(
              [...(p.origins ?? []).map((o) => o.origin?.name), ...(p.genders ?? []).map((g) => g.gender?.name)].filter(
                (n): n is string => Boolean(n),
              ),
            ),
          ],
          author: names(p.autors),
          artist: names(p.artists),
        };
      },
      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        const p = await project(manga.url);
        return (p.lastChapters ?? []).map((c) => ({
          url: `/ver/${p.slug}/${c.slug}`,
          name: c.num ? `Capítulo ${c.num}` : c.slug,
          scanlator: c.name?.trim() || undefined,
          uploadedAt: time(c.created_at) || undefined,
        }));
      },
      async getPages(chapter: Chapter): Promise<Page[]> {
        const body = (await http.get(baseUrl + chapter.url, { headers })).body;
        // The image list is in the RSC payload: \"pages\":{…\"urlImg\":\"[\\\"url\\\",…]\"} (null when locked).
        const start = body.indexOf('\\"pages\\":{');
        const key = 'urlImg\\":\\"[';
        const from = start < 0 ? -1 : body.indexOf(key, start);
        if (from < 0) return [];
        const raw = body.slice(from + key.length - 1, body.indexOf(']', from) + 1).replace(/\\+"/g, '"');
        return (JSON.parse(raw) as string[]).map((url, index) => ({ index, imageUrl: encodeURI(url) }));
      },
      imageHeaders: () => headers,
      resolveUrl(url: string): MangaSummary | null {
        const match = /^https?:\/\/([^/?#]+)\/ver\/([^/?#]+)\/?(?:[?#]|$)/i.exec(url.trim());
        return match && match[1]!.toLowerCase() === hostOf(baseUrl) ? { url: `/ver/${match[2]}`, title: '' } : null;
      },
      getWebUrl: (item) => baseUrl + item.url,
    };
  },
});
