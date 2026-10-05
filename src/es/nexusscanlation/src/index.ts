import {
  type Chapter,
  type Filter,
  type FilterState,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type TileOp,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf } from './common/utils';

const BASE_URL = 'https://nexusscanlation.com';
const API_URL = 'https://api.nexusscanlation.com/api/v1';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, 'Accept-Language': 'es-419,es;q=0.9,es-ES;q=0.8' };
// The page api answers "cliente no permitido" without the browser's fetch metadata.
const apiHeaders = {
  ...headers,
  Accept: 'application/json, text/plain, */*',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
};

interface CatalogEntry {
  id: string;
  slug: string;
  titulo: string;
  portada_url?: string | null;
}

interface SeriesDto extends CatalogEntry {
  descripcion?: string | null;
  estado?: string;
  generos?: { nombre: string }[] | null;
  autores?: { nombre: string; rol?: string | null }[] | null;
}

interface ChapterEntry {
  slug: string;
  numero: number;
  titulo?: string | null;
  published_at?: string | null;
  es_premium?: boolean;
}

interface PageEntry {
  url: string;
  w?: number;
  h?: number;
  sc?: { c: number; r: number; s: number; v?: number } | null;
}

async function api<T>(path: string): Promise<T> {
  return (await http.get<T>(API_URL + path, { headers: apiHeaders, responseType: 'json' })).body;
}

/** Covers from the CDN by series id (the site's own urls trip its WAF). */
const cover = (id: string | null | undefined, raw: string | null | undefined) =>
  id ? `https://cdn.nexusscanlation.com/series/${id}/portada.jpg` : raw || undefined;

async function catalog(query: string): Promise<MangaPage> {
  const result = await api<{ data?: CatalogEntry[]; meta?: { has_next?: boolean } }>(query);
  return {
    items: (result.data ?? [])
      .filter((e) => e.slug.trim() && e.titulo.trim())
      .map((e) => ({ url: `/series/${e.slug}`, title: e.titulo, thumbnailUrl: cover(e.id, e.portada_url) })),
    hasNextPage: result.meta?.has_next ?? false,
  };
}

async function series(url: string): Promise<{ serie: SeriesDto; capitulos?: ChapterEntry[] }> {
  const result = await api<{ serie: SeriesDto; capitulos?: ChapterEntry[] } | { data: { serie: SeriesDto } }>(
    `/series/${url.split('/')[2]}`,
  );
  return 'data' in result ? (result.data as { serie: SeriesDto; capitulos?: ChapterEntry[] }) : result;
}

const STATUS: Record<string, MangaStatus> = {
  en_emision: 'ongoing',
  finalizado: 'completed',
  pausado: 'hiatus',
  cancelado: 'cancelled',
};

/** Mulberry32, as the site's reader uses to shuffle tiles. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const select = (id: string, label: string, options: [string, string][], value = options[0]![1]): Filter => ({
  type: 'select',
  id,
  label,
  default: value,
  options: options.map(([l, v]) => ({ label: l, value: v })),
});

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => catalog(`/catalog?page=${page}&orden=popular`),
    async getLatest(page: number): Promise<MangaPage> {
      type Update = { serie_id?: string | null; serie_slug: string; serie_titulo: string; portada_url?: string | null };
      const result = await api<{ latest_updates?: Update[] }>(`/public/landing?page=${page}`);
      const seen = new Set<string>();
      const items = (result.latest_updates ?? [])
        .filter(
          (u) =>
            u.serie_slug.trim() && u.serie_titulo.trim() && !seen.has(u.serie_slug) && Boolean(seen.add(u.serie_slug)),
        )
        .map((u) => ({
          url: `/series/${u.serie_slug}`,
          title: u.serie_titulo,
          thumbnailUrl: cover(u.serie_id, u.portada_url),
        }));
      return { items, hasNextPage: false };
    },
    async getFilters(): Promise<Filter[]> {
      const genres = await api<{ data?: { slug: string; nombre: string }[] }>('/catalog/genres?has_series=true')
        .then((r) => r.data ?? [])
        .catch(() => []);
      return [
        select('orden', 'Ordenar por', [
          ['Popular', 'popular'],
          ['Nuevo', 'nuevo'],
          ['A–Z', 'az'],
          ['Rating', 'rating'],
        ]),
        select('estado', 'Estado', [
          ['Todos', ''],
          ['En Emisión', 'en_emision'],
          ['Completado', 'finalizado'],
          ['En Pausa', 'pausado'],
          ['Cancelado', 'cancelado'],
        ]),
        select('tipo', 'Tipo', [
          ['Todos', ''],
          ['Manhwa', 'manhwa'],
          ['Manga', 'manga'],
          ['Manhua', 'manhua'],
          ['Novela', 'novel'],
          ['Manfra', 'manfra'],
          ['Doujin', 'doujin'],
        ]),
        ...(genres.length
          ? [select('genero', 'Género', [['Todos', ''], ...genres.map((g): [string, string] => [g.nombre, g.slug])])]
          : []),
      ];
    },
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) return catalog(`/catalog/search?q=${encodeURIComponent(query.trim())}&page=${page}`);
      const params = [`page=${page}`];
      for (const id of ['orden', 'estado', 'tipo', 'genero']) {
        const value = filters[id];
        if (typeof value === 'string' && value) params.push(`${id}=${encodeURIComponent(value)}`);
      }
      return catalog(`/catalog?${params.join('&')}`);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { serie } = await series(manga.url);
      const credits = (serie.autores ?? []).filter((c) => c.nombre.trim());
      const names = (artist: boolean) =>
        [
          ...new Set(
            credits.filter((c) => (c.rol?.toLowerCase() === 'artista') === artist).map((c) => c.nombre.trim()),
          ),
        ].join(', ') || undefined;
      return {
        url: manga.url,
        title: serie.titulo,
        thumbnailUrl: cover(serie.id, serie.portada_url),
        description: serie.descripcion || undefined,
        genres: (serie.generos ?? []).map((g) => g.nombre).filter(Boolean),
        status: STATUS[serie.estado?.toLowerCase() ?? ''] ?? 'unknown',
        author: names(false),
        artist: names(true),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { serie, capitulos } = await series(manga.url);
      return (capitulos ?? []).map((c) => {
        const time = c.published_at ? Date.parse(c.published_at) : Number.NaN;
        return {
          url: `/series/${serie.slug}/chapter/${c.slug}`,
          name: `${c.es_premium ? '🔒 ' : ''}Capítulo ${c.numero}${c.titulo?.trim() ? ` - ${c.titulo}` : ''}`,
          number: c.numero,
          uploadedAt: Number.isNaN(time) ? undefined : time,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [, , seriesSlug, , chapterSlug] = chapter.url.split('/');
      const result = await api<{ data?: { paginas?: PageEntry[]; es_premium?: boolean; locked?: boolean } }>(
        `/series/${seriesSlug}/capitulos/${chapterSlug}`,
      );
      const data = result.data;
      if (!data) throw new Error('Failed to decode server response.');
      if (data.es_premium || data.locked) throw new Error('Capítulo premium: no disponible.');
      return (data.paginas ?? []).map((page, index) => {
        const sc = page.sc;
        if (sc && (sc.v ?? 1) >= 2) throw new Error('Capítulo con imágenes volteadas (v2): no soportado');
        // Scrambled pages carry their tile layout in the fragment for transformImage.
        const fragment = sc ? `#scramble=${sc.c},${sc.r},${sc.s},${page.w ?? 0},${page.h ?? 0}` : '';
        return { index, imageUrl: page.url + fragment };
      });
    },
    imageHeaders: () => headers,
    transformImage(page: Page): ImageTransform {
      const match = /#scramble=(\d+),(\d+),(\d+),(\d+),(\d+)$/.exec(page.imageUrl ?? '');
      if (!match) return {};
      const [cols, rows, seed, width, height] = match.slice(1).map(Number) as [number, number, number, number, number];
      const tileWidth = Math.floor(width / cols);
      const tileHeight = Math.floor(height / rows);
      const count = cols * rows;
      const random = mulberry32(seed);
      const permutation = Array.from({ length: count }, (_, i) => i);
      for (let i = count - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [permutation[i], permutation[j]] = [permutation[j]!, permutation[i]!];
      }
      const ops: TileOp[] = permutation.map((dst, src) => ({
        sx: (src % cols) * tileWidth,
        sy: Math.floor(src / cols) * tileHeight,
        w: tileWidth,
        h: tileHeight,
        dx: (dst % cols) * tileWidth,
        dy: Math.floor(dst / cols) * tileHeight,
      }));
      return { tiles: { width: tileWidth * cols, height: tileHeight * rows, ops } };
    },
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/series\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/series/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
