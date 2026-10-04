import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, htmlToText } from './common/utils';
import { imageSize } from './image';

const BASE_URL = 'https://asurascans.com';
const API_URL = 'https://api.asurascans.com/api';
const PER_PAGE = 20;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const RANDOM_SUFFIX = /-[a-z0-9]{8}$/;

const HIDE_PREMIUM_PREFERENCE: Preference = {
  type: 'switch',
  key: 'pref_hide_premium_chapters',
  label: 'Hide premium chapters (they require a subscription)',
  default: true,
};

type Options = [string, string][];

const SORTS: Options = [
  ['Latest Update', 'latest'],
  ['Popular', 'popular'],
  ['Rating', 'rating'],
  ['A-Z', 'title'],
  ['Newest', 'update'],
];

const STATUSES: Options = [
  ['All', ''],
  ['Ongoing', 'ongoing'],
  ['Completed', 'completed'],
  ['Hiatus', 'hiatus'],
  ['Dropped', 'dropped'],
  ['Axed', 'axed'],
];

const TYPES: Options = [
  ['All', ''],
  ['Manhwa', 'manhwa'],
  ['Manhua', 'manhua'],
  ['Mangatoon', 'manga'],
];

interface MangaDto {
  public_url: string;
  slug: string;
  title: string;
  cover?: string;
  coverUrl?: string;
}

interface DetailsDto {
  title: string;
  coverUrl?: string;
  author?: string | null;
  artist?: string | null;
  description?: string | null;
  rating?: number | null;
  bookmarkCount?: number | null;
  type?: string | null;
  popularityRank?: number | null;
  alternativeTitles?: string | null;
  genres?: { name: string; slug: string }[] | null;
  status?: string | null;
}

interface ChapterDto {
  number: number;
  title?: string | null;
  created_at?: string;
  is_premium?: boolean;
  is_locked?: boolean;
  early_access_until?: string | null;
}

interface PageDto {
  url: string;
  tiles?: number[] | null;
  tile_cols?: number | null;
  tile_rows?: number | null;
}

async function load(url: string): Promise<{ document: HtmlElement; status: number; url: string }> {
  const response = await http.request<string>({ url: absoluteUrl(BASE_URL, url), headers });
  return { document: html.load(response.body, { baseUrl: response.url }), status: response.status, url: response.url };
}

/** Astro serialises props as `[type, value]` pairs; unwraps them into plain JSON. */
function unwrapAstro(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (value.length === 1 && typeof value[0] === 'number') return null;
    if (value.length === 2 && typeof value[0] === 'number') return unwrapAstro(value[1]);
    return value.map(unwrapAstro);
  }
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unwrapAstro(v)]));
  return value;
}

function astroProp<T>(document: HtmlElement, ...keys: string[]): T {
  const prop = document.selectFirst(keys.map((k) => `[props*=${k}]`).join(''))?.attr('props');
  if (!prop) throw new Error(`Unable to find prop with ${keys.join(', ')}`);
  return unwrapAstro(JSON.parse(prop)) as T;
}

const lastSegment = (url: string) => url.replace(/\/+$/, '').split('/').pop() ?? '';

async function browse(page: number, query: string, filters: FilterState): Promise<MangaPage> {
  const params = [`offset=${(page - 1) * PER_PAGE}`, `limit=${PER_PAGE}`];
  if (query.trim()) params.push(`search=${encodeURIComponent(query.trim())}`);
  const sort = (filters.sort as { value?: string; ascending?: boolean } | undefined) ?? {};
  params.push(`sort=${sort.value ?? 'latest'}`, `order=${sort.ascending ? 'asc' : 'desc'}`);
  for (const id of ['status', 'type'])
    if (typeof filters[id] === 'string' && filters[id]) params.push(`${id}=${filters[id]}`);
  const genres = Object.entries(filters)
    .filter(([id, v]) => id.startsWith('genre.') && v === true)
    .map(([id]) => id.slice(6));
  if (genres.length) params.push(`genres=${genres.join(',')}`);
  for (const id of ['author', 'artist', 'min_chapters']) {
    const value = typeof filters[id] === 'string' ? (filters[id] as string).trim() : '';
    if (value) params.push(`${id}=${encodeURIComponent(value)}`);
  }
  const response = await http.get(`${API_URL}/series?${params.join('&')}`, { headers });
  const result = JSON.parse(response.body) as { data?: MangaDto[]; meta?: { has_more?: boolean } };
  return {
    items: (result.data ?? []).map((m) => ({
      url: `/comics/${lastSegment(m.public_url)}`,
      title: m.title,
      thumbnailUrl: m.cover ?? m.coverUrl,
    })),
    hasNextPage: result.meta?.has_more === true,
  };
}

/** Series urls carry a random suffix that changes; without it the site redirects to the current one. */
async function seriesPage(url: string): Promise<{ document: HtmlElement; url: string }> {
  let page = await load(url);
  if (page.status !== 200) page = await load(url.replace(RANDOM_SUFFIX, ''));
  if (page.status !== 200) throw new Error(`HTTP ${page.status} for ${url}`);
  return page;
}

function status(text: string | null | undefined): MangaStatus {
  switch (text?.toLowerCase()) {
    case 'ongoing':
      return 'ongoing';
    case 'completed':
      return 'completed';
    case 'hiatus':
      return 'hiatus';
    case 'dropped':
    case 'axed':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

function description(d: DetailsDto): string {
  const meta = [
    d.popularityRank != null ? `Rank: #${d.popularityRank}` : null,
    d.rating != null ? `Rating: ${d.rating.toFixed(2)}` : null,
    d.bookmarkCount != null
      ? `Bookmarks: ${
          d.bookmarkCount >= 1_000_000
            ? `${(d.bookmarkCount / 1_000_000).toFixed(1)}M`
            : d.bookmarkCount >= 1_000
              ? `${(d.bookmarkCount / 1_000).toFixed(1)}K`
              : d.bookmarkCount
        }`
      : null,
  ].filter(Boolean);
  const parts = [meta.join(' • ')];
  if (d.description) parts.push(htmlToText(d.description));
  const alts = (
    d.alternativeTitles?.includes('•') ? d.alternativeTitles.split('•') : (d.alternativeTitles ?? '').split(',')
  )
    .map((t) => t.trim())
    .filter(Boolean);
  if (alts.length) parts.push(`Alternative Titles:\n${alts.map((t) => `- ${t}`).join('\n')}`);
  return parts.filter(Boolean).join('\n\n');
}

function isLocked(c: ChapterDto): boolean {
  if (c.is_premium || c.is_locked) return true;
  const until = c.early_access_until ? Date.parse(c.early_access_until) : NaN;
  return !Number.isNaN(until) && until > Date.now();
}

export default defineExtension({
  preferences: () => [HIDE_PREMIUM_PREFERENCE],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => browse(page, '', { sort: { value: 'popular', ascending: false } }),
    getLatest: (page) => browse(page, '', { sort: { value: 'latest', ascending: false } }),
    search: (query, page, filters) => browse(page, query, filters),
    async getFilters(): Promise<Filter[]> {
      const select = (id: string, label: string, options: Options): Filter => ({
        type: 'select',
        id,
        label,
        options: options.map(([l, v]) => ({ label: l, value: v })),
        default: '',
      });
      const filters: Filter[] = [
        {
          type: 'sort',
          id: 'sort',
          label: 'Sort By',
          options: SORTS.map(([label, value]) => ({ label, value })),
          default: { value: 'latest', ascending: false },
        },
        select('status', 'Status', STATUSES),
        select('type', 'Type', TYPES),
      ];
      try {
        const { document } = await load('/browse');
        const { availableGenres } = astroProp<{ availableGenres: { name: string; slug: string }[] }>(
          document,
          'availableGenres',
        );
        filters.push({
          type: 'group',
          id: 'genre',
          label: 'Genres',
          filters: availableGenres.map((g) => ({ type: 'checkbox', id: `genre.${g.slug}`, label: g.name })),
        });
      } catch {
        // Genres are optional.
      }
      filters.push(
        { type: 'text', id: 'author', label: 'Author' },
        { type: 'text', id: 'artist', label: 'Artist' },
        { type: 'text', id: 'min_chapters', label: 'Min Chapters' },
      );
      return filters;
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document, url } = await seriesPage(manga.url);
      const d = astroProp<DetailsDto>(document, 'title', 'description');
      return {
        url: `/comics/${lastSegment(url)}`,
        title: d.title || manga.title,
        thumbnailUrl: d.coverUrl ?? manga.thumbnailUrl,
        author: d.author || undefined,
        artist: d.artist || undefined,
        description: description(d) || undefined,
        genres: [
          ...(d.type ? [d.type.charAt(0).toUpperCase() + d.type.slice(1)] : []),
          ...(d.genres ?? []).map((g) => g.name),
        ],
        status: status(d.status),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { document, url } = await seriesPage(manga.url);
      const slug = lastSegment(url);
      const hidePremium = prefs.get<boolean>(HIDE_PREMIUM_PREFERENCE.key) ?? true;
      const { chapters } = astroProp<{ chapters?: ChapterDto[] | null }>(document, 'chapters');
      return (chapters ?? [])
        .filter((c) => !(hidePremium && isLocked(c)))
        .map((c) => {
          const date = c.created_at ? Date.parse(c.created_at) : NaN;
          return {
            url: `/comics/${slug}/chapter/${c.number}`,
            name: `${isLocked(c) ? '🔒 ' : ''}Chapter ${c.number}${c.title ? ` - ${c.title}` : ''}`,
            number: c.number,
            uploadedAt: Number.isNaN(date) ? undefined : date,
          };
        });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document } = await seriesPage(chapter.url);
      let pages: PageDto[] = [];
      try {
        pages = astroProp<{ pages: PageDto[] }>(document, 'pages').pages ?? [];
      } catch {
        pages = [];
      }
      return pages.map((p, index) => ({
        index,
        imageUrl: p.tiles?.length
          ? `${p.url}#${JSON.stringify({ tiles: p.tiles, cols: p.tile_cols ?? 4, rows: p.tile_rows ?? 5 })}`
          : p.url,
      }));
    },
    imageHeaders: () => headers,
    // Some pages come as a shuffled tile grid: tile w of the file belongs at position tiles[w].
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      const fragment = (page.imageUrl ?? '').split('#')[1];
      if (!fragment?.startsWith('{')) return {};
      const { tiles, cols, rows } = JSON.parse(decodeURIComponent(fragment)) as {
        tiles: number[];
        cols: number;
        rows: number;
      };
      const size = imageSize(bytes);
      if (!size) return {};
      const tileW = Math.floor(size[0] / cols);
      const tileH = Math.floor(size[1] / rows);
      return {
        tiles: {
          width: tileW * cols,
          height: tileH * rows,
          ops: tiles.map((j, w) => ({
            sx: (w % cols) * tileW,
            sy: Math.floor(w / cols) * tileH,
            w: tileW,
            h: tileH,
            dx: (j % cols) * tileW,
            dy: Math.floor(j / cols) * tileH,
          })),
        },
      };
    },
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/comics\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/comics/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
