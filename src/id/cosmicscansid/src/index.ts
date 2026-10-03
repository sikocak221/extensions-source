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
import { USER_AGENT, hostOf, withQuery } from './common/utils';

const BASE_URL = 'https://04.cosmicscans.to';
const API_URL = 'https://cdncid.csmcscns.id/v1/manga';
const PAGE_SIZE = 24;

// Manga urls are "/series/<slug>", chapter urls "/chapter/<slug>".

interface MangaDto {
  title?: string | null;
  slug?: string | null;
  cover?: string | null;
}

interface ListResponse {
  data?: MangaDto[];
  cursor?: { hasNext?: boolean; nextCursor?: string | null } | null;
}

interface DetailDto {
  title?: string | null;
  slug?: string | null;
  cover?: string | null;
  sinopsis?: string | null;
  type?: string | null;
  author?: string | null;
  genre?: string[] | null;
  genres?: string[] | null;
  status?: string | null;
  chapters?:
    { slug?: string | null; chapterNum?: string | null; time?: string | null; redirect_link?: string | null }[] | null;
}

const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, Accept: 'application/json' };

async function api<T>(url: string): Promise<T> {
  return (await http.get<T>(url, { headers, responseType: 'json' })).body;
}

const toSummary = (m: MangaDto): MangaSummary => ({
  url: `/series/${m.slug ?? ''}`,
  title: m.title ?? '',
  thumbnailUrl: m.cover || undefined,
});

// The API answers 404 for slugs over 100 characters (a route parameter limit): such series cannot be
// opened, so lists leave them out.
const readable = (m: MangaDto) => Boolean(m.slug) && m.slug!.length <= 100;

const slugOf = (url: string) => url.replace(/\/+$/, '').split('/').pop() ?? '';

function parseStatus(status: string | null | undefined): MangaStatus {
  switch (status?.toLowerCase()) {
    case 'ongoing':
      return 'ongoing';
    case 'completed':
    case 'complete':
      return 'completed';
    case 'hiatus':
    case 'on hiatus':
    case 'on-hold':
    case 'on hold':
      return 'hiatus';
    case 'dropped':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

// The API pages with cursors: the cursor for page n + 1 is remembered when page n is loaded.
const cursors = new Map<string, string>();

async function filterList(key: string, page: number, params: Record<string, string>, extra = ''): Promise<MangaPage> {
  const after = page > 1 ? cursors.get(`${key}:${page}`) : undefined;
  if (page > 1 && !after) return { items: [], hasNextPage: false };
  const url = withQuery(`${API_URL}/filter`, { limit: String(PAGE_SIZE), ...params, after }) + extra;
  const result = await api<ListResponse>(url);
  if (result.cursor?.nextCursor) cursors.set(`${key}:${page + 1}`, result.cursor.nextCursor);
  return { items: (result.data ?? []).filter(readable).map(toSummary), hasNextPage: result.cursor?.hasNext === true };
}

const option = (label: string, value: string) => ({ label, value });
const GENRES = [
  'action', 'adventure', 'comedy', 'cultivation', 'delinquent', 'drama', 'ecchi', 'fantasy', 'harem', 'historical',
  'horror', 'isekai', 'martial-arts', 'murim', 'mystery', 'psychological', 'reincarnation', 'returner', 'revenge',
  'romance', 'school-life', 'sci-fi', 'seinen', 'shoujo', 'shounen', 'slice-of-life', 'sports', 'supernatural',
  'system', 'thriller', 'tragedy',
]; // prettier-ignore
const label = (slug: string) =>
  slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    getPopular: (page) => filterList('popular', page, { order_by: 'popular' }),

    getLatest: (page) => filterList('update', page, { order_by: 'update' }),

    async search(query: string, page: number, state: FilterState): Promise<MangaPage> {
      if (query.trim()) {
        if (page > 1) return { items: [], hasNextPage: false };
        const result = await api<ListResponse>(withQuery(`${API_URL}/search`, { limit: '48', q: query.trim() }));
        return { items: (result.data ?? []).filter(readable).map(toSummary), hasNextPage: false };
      }
      const params: Record<string, string> = {};
      const keys: Record<string, string> = {
        order: 'order_by',
        status: 'release_status',
        type: 'type_manga',
        project: 'is_project',
      };
      for (const [id, key] of Object.entries(keys)) {
        const value = state[id];
        if (typeof value === 'string' && value) params[key] = value;
      }
      const genres = GENRES.filter((g) => state[`genre.${g}`] === true);
      const extra = genres.map((g) => `&genres_slug=${encodeURIComponent(g)}`).join('');
      return filterList(`filter:${JSON.stringify(params)}:${genres.join(',')}`, page, params, extra);
    },

    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'order',
        label: 'Urutkan',
        options: [
          option('Update', 'update'),
          option('A–Z', 'az'),
          option('Z–A', 'za'),
          option('Baru Ditambahkan', 'added'),
          option('Popular', 'popular'),
        ],
      },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [option('Semua', ''), ...['Ongoing', 'Completed', 'Hiatus', 'Dropped'].map((s) => option(s, s))],
      },
      {
        type: 'select',
        id: 'type',
        label: 'Tipe',
        options: [option('Semua', ''), ...['Manga', 'Manhwa', 'Manhua', 'Webtoon'].map((s) => option(s, s))],
      },
      {
        type: 'select',
        id: 'project',
        label: 'Project',
        options: [option('Semua', ''), option('Project Only', 'true')],
      },
      {
        type: 'group',
        id: 'genre',
        label: 'Genre',
        filters: GENRES.map((g) => ({ type: 'checkbox', id: `genre.${g}`, label: label(g) })),
      },
    ],

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const slug = slugOf(manga.url);
      const { data } = await api<{ data: DetailDto }>(`${API_URL}/mangaDetail/${slug}`);
      const type = data.type?.toLowerCase() ?? '';
      return {
        url: `/series/${data.slug || slug}`,
        title: data.title || manga.title,
        thumbnailUrl: data.cover || manga.thumbnailUrl,
        description:
          [data.sinopsis, data.type && `Type: ${data.type}`, data.author && `Author: ${data.author}`]
            .filter(Boolean)
            .join('\n\n') || undefined,
        genres: data.genre ?? data.genres ?? undefined,
        author: data.author || undefined,
        status: parseStatus(data.status),
        type: type.includes('manhwa')
          ? 'manhwa'
          : type.includes('manhua')
            ? 'manhua'
            : type.includes('manga')
              ? 'manga'
              : undefined,
      };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { data } = await api<{ data: DetailDto }>(`${API_URL}/mangaDetail/${slugOf(manga.url)}`);
      return (data.chapters ?? [])
        .filter((c) => c.slug && !c.redirect_link)
        .map((c) => {
          const number = Number.parseFloat(c.chapterNum ?? '');
          const time = c.time ? Date.parse(c.time) : Number.NaN;
          return {
            url: `/chapter/${c.slug}`,
            name: `Chapter ${c.chapterNum ?? ''}`.trim(),
            number: Number.isFinite(number) ? number : undefined,
            uploadedAt: Number.isFinite(time) ? time : undefined,
          };
        });
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const { data } = await api<{ data: { chapters?: string[] | null; redirect_link?: string | null } }>(
        `${API_URL}/readingPage/${slugOf(chapter.url)}`,
      );
      if (data.redirect_link) return [];
      return (data.chapters ?? [])
        .map((fragment) => html.load(fragment).selectFirst('img')?.attr('src') ?? '')
        .filter(Boolean)
        .map((imageUrl, index) => ({ index, imageUrl }));
    },

    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/(?:series|manga)\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]?.toLowerCase() === hostOf(BASE_URL) ? { url: `/series/${match[2]}`, title: '' } : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
