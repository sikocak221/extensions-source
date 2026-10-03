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
import { USER_AGENT, absoluteUrl, findRscObject, hostOf } from './common/utils';

const BASE_URL = 'https://lustoon.com';
const API_URL = 'https://back.lustoon.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const rscHeaders = { ...headers, RSC: '1' };

const TYPES: [string, string][] = [
  ['All', ''],
  ['Webtoon', '1'],
  ['Manhwa', '2'],
  ['Manhua', '3'],
  ['Manga', '4'],
  ['Manhwa +19', '5'],
  ['+19 Uncensored', '6'],
  ['BL Uncensored', '7'],
  ['Manhwa BL', '8'],
  ['Novel', '9'],
  ['Manhua BL', '10'],
  ['Visual novel', '11'],
];

const STATUSES: [string, string][] = [
  ['All', ''],
  ['Ongoing', '1'],
  ['Paused', '2'],
  ['Abandoned', '3'],
  ['Completed', '4'],
  ['Cancelled', '5'],
];

const GENRES: [string, string][] = [
  ['All', ''],
  ['Action', '1'],
  ['Adventure', '2'],
  ['Animation', '3'],
  ['Apocalyptic', '4'],
  ['Boys Love', '5'],
  ['Comedy', '6'],
  ['Crime', '7'],
  ['Cyberpunk', '8'],
  ['Demons', '9'],
  ['Drama', '10'],
  ['Ecchi', '11'],
  ['Family', '12'],
  ['Fantasy', '13'],
  ['Foreign', '14'],
  ['Gender Bender', '15'],
  ['Girls Love', '16'],
  ['Gore', '17'],
  ['Harem', '18'],
  ['History', '19'],
  ['Horror', '20'],
  ['Kids', '21'],
  ['Magic', '22'],
  ['Martial Arts', '23'],
  ['Mecha', '24'],
  ['Military', '25'],
  ['Mystery', '26'],
  ['Music', '27'],
  ['Parody', '28'],
  ['Police', '29'],
  ['Psychological', '30'],
  ['Reality', '31'],
  ['Reincarnation', '32'],
  ['Romance', '33'],
  ['Samurai', '34'],
  ['School Life', '35'],
  ['Sci-Fi', '36'],
  ['Slice of Life', '37'],
  ['Soap Opera', '38'],
  ['Sports', '39'],
  ['Supernatural', '40'],
  ['Super Power', '41'],
  ['Survival', '42'],
  ['Thriller', '43'],
  ['Tragedy', '44'],
  ['Vampires', '45'],
  ['Virtual Reality', '46'],
  ['War', '47'],
  ['Western', '48'],
  ['Dungeon', '49'],
  ['Systems', '50'],
  ['Revenge', '51'],
  ['Regression', '52'],
  ['Isekai', '53'],
  ['Video Games', '54'],
  ['Villainess', '55'],
  ['Adult', '56'],
  ['Smut', '57'],
  ['Transmigration', '58'],
  ['Ghosts', '59'],
  ['Dragons', '60'],
  ['Beasts', '61'],
  ['Aliens', '62'],
  ['Omegaverse', '63'],
];

const SORTS = ['Views', 'Name', 'Updated', 'Added', 'Chapters', 'Followers'];

interface SearchItemDto {
  name?: string | null;
  slug?: string | null;
  urlImg?: string | null;
}

interface SerieDto extends SearchItemDto {
  sinopsis?: string | null;
  state?: { estado: string } | null;
  genders?: { name: string }[] | null;
  chapters?: { slug?: string | null; num?: number | null; name?: string | null; createdAt?: string | null }[] | null;
}

const https = (url: string | null | undefined) => url?.replace('http://', 'https://') || undefined;

const toSummary = (s: SearchItemDto): MangaSummary => ({
  url: `/comic/${s.slug}`,
  title: s.name ?? '',
  thumbnailUrl: https(s.urlImg),
});

async function filtered(params: Record<string, string>): Promise<MangaPage> {
  const query = Object.entries({ limit: '24', loading: 'true', gendersId: '', origin: '', state: '', ...params })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const response = await http.get(`${API_URL}/filtrar?${query}`, { headers });
  const data = JSON.parse(response.body) as {
    data?: SearchItemDto[];
    meta?: { current_page: number; last_page: number } | null;
  };
  return {
    items: (data.data ?? []).filter((s) => s.slug).map(toSummary),
    hasNextPage: (data.meta?.current_page ?? 1) < (data.meta?.last_page ?? 1),
  };
}

function status(text: string | undefined): MangaStatus {
  switch (text?.toLowerCase()) {
    case 'en emision':
    case 'ongoing':
      return 'ongoing';
    case 'completado':
    case 'finalizado':
    case 'completed':
      return 'completed';
    case 'cancelado':
    case 'cancelled':
      return 'cancelled';
    case 'pausado':
    case 'hiatus':
    case 'paused':
      return 'hiatus';
    default:
      return 'unknown';
  }
}

async function serie(url: string): Promise<SerieDto> {
  const body = (await http.get(absoluteUrl(BASE_URL, url), { headers: rscHeaders })).body;
  const found = findRscObject<SerieDto>(body, (v) => 'slug' in v && 'chapters' in v);
  if (!found) throw new Error('Failed to find valid series data');
  return found;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => filtered({ page: String(page), orderBy: '6', sort: 'desc' }),
    async getLatest(page: number): Promise<MangaPage> {
      if (page === 1) {
        const body = (await http.get(BASE_URL, { headers: rscHeaders })).body;
        const home = findRscObject<{ comics: SearchItemDto[] }>(body, (v) => Array.isArray(v.comics));
        const items = (home?.comics ?? []).filter((s) => s.slug).map(toSummary);
        if (items.length) return { items, hasNextPage: true };
      }
      return filtered({ page: String(page - 1), orderBy: '3', sort: 'desc' });
    },
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) {
        const response = await http.get(`${API_URL}/home/buscar?query=${encodeURIComponent(query.trim())}`, {
          headers,
        });
        const items = (JSON.parse(response.body) as SearchItemDto[]).filter((s) => s.slug).map(toSummary);
        return { items, hasNextPage: false };
      }
      const sort = (filters.sort as { value?: string; ascending?: boolean } | undefined) ?? {};
      const value = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');
      return filtered({
        page: String(page),
        orderBy: sort.value ?? '1',
        sort: sort.ascending ? 'asc' : 'desc',
        gendersId: value('genre'),
        origin: value('type'),
        state: value('status'),
      });
    },
    getFilters: (): Filter[] => [
      {
        type: 'sort',
        id: 'sort',
        label: 'Sort by',
        options: SORTS.map((label, i) => ({ label, value: String(i + 1) })),
        default: { value: '3', ascending: false },
      },
      { type: 'separator' },
      ...(
        [
          ['type', 'Type', TYPES],
          ['status', 'Status', STATUSES],
          ['genre', 'Genre', GENRES],
        ] as const
      ).map(([id, label, options]): Filter => ({
        type: 'select',
        id,
        label,
        options: options.map(([l, v]) => ({ label: l, value: v })),
        default: '',
      })),
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const s = await serie(manga.url);
      return {
        ...toSummary({ ...s, slug: s.slug ?? manga.url.split('/').pop() }),
        description: s.sinopsis || undefined,
        status: status(s.state?.estado),
        genres: (s.genders ?? []).map((g) => g.name),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const s = await serie(manga.url);
      const slug = s.slug ?? manga.url.split('/').pop();
      return (s.chapters ?? [])
        .filter((c) => c.slug)
        .map((c) => {
          const date = c.createdAt ? Date.parse(c.createdAt) : NaN;
          return {
            url: `/comic/${slug}/${c.slug}`,
            name: c.name && /\d/.test(c.name) ? c.name : `Chapter ${c.num ?? ''}`.trim(),
            number: c.num ?? undefined,
            uploadedAt: Number.isNaN(date) ? undefined : date,
          };
        });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const body = (await http.get(absoluteUrl(BASE_URL, chapter.url), { headers })).body;
      const pageches = findRscObject<{ urlImg?: string | null }>(body, (v) => 'urlImg' in v && 'chapterId' in v);
      let images: string[] = [];
      try {
        images = pageches?.urlImg ? (JSON.parse(pageches.urlImg) as string[]) : [];
      } catch {
        images = [];
      }
      if (images.length === 0)
        images = [...body.matchAll(/https?:\/\/media\.lustoon\.com\/file\/[^"\s'\\]+\.(?:jpg|jpeg|png|webp|avif)/gi)]
          .map((m) => m[0])
          .filter((u) => u.includes('/serie/'));
      return [...new Set(images.map((u) => u.replace('http://', 'https://')))]
        .filter((u) => !u.includes('brakeout'))
        .map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/comic\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/comic/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
