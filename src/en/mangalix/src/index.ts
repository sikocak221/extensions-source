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
import { USER_AGENT, absoluteUrl, hostOf } from './common/utils';
import { parseJsLiteral } from './jsliteral';

const BASE_URL = 'https://mangalix.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const GENRES = [
  '4-Koma',
  'Action',
  'Adventure',
  'Comedy',
  'Dark Fantasy',
  'Drama',
  'Ecchi',
  'Family',
  'Fantasy',
  'Harem',
  'Historical',
  'Horror',
  'Isekai',
  'Magic',
  'Manhwa',
  'Martial Arts',
  'Mature',
  'Mecha',
  'Military',
  'Murim',
  'Mystery',
  'Parody',
  'Psychological',
  'Regression',
  'Reincarnation',
  'Romance',
  'School Life',
  'Sci-Fi',
  'Seinen',
  'Shoujo',
  'Shounen',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Survival',
  'System',
  'Thriller',
  'Tragedy',
  'Vampire',
  'Webtoon',
];

const SORTS: [string, string][] = [
  ['Default', 'default'],
  ['Latest Update', 'latest'],
  ['Release Year', 'release_year'],
  ['Rating', 'rating'],
  ['Title', 'title'],
];

const IMAGE_HOSTS: [string, string][] = [
  ['$TEMP', 'https://temp.compsci88.com'],
  ['$HOT', 'https://scans-hot.planeptune.us'],
  ['$LST', 'https://scans.lastation.us'],
  ['$LOW', 'https://official.lowee.us'],
  ['$MFK', 'https://images.mangafreak.me'],
];

interface MangaDto {
  slug: string;
  title: string;
  description?: string;
  coverImage?: string;
  author?: string;
  status?: string;
  rating?: number;
  releaseYear?: number;
  genres?: string[];
  latestChapter?: { releaseDate?: string | null } | null;
}

interface ChapterDto {
  id: string;
  number: number;
  title?: string;
  releaseDate?: string | null;
  pages?: string[];
}

const key = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function normalizedStatus(text: string): string {
  const k = key(text);
  if (['ongoing', 'publishing', 'releasing', 'active'].includes(k)) return 'ongoing';
  if (['completed', 'complete', 'finished'].includes(k)) return 'completed';
  if (['hiatus', 'onhiatus', 'paused'].includes(k)) return 'hiatus';
  if (['cancelled', 'canceled', 'dropped', 'axed', 'discontinued'].includes(k)) return 'cancelled';
  return k;
}

const GENRE_ALIASES: Record<string, string> = {
  school: 'schoollife',
  shojo: 'shoujo',
  shonen: 'shounen',
  webtoons: 'webtoon',
};
const normalizedGenre = (text: string) => GENRE_ALIASES[key(text)] ?? key(text);

function timestamp(value: string | null | undefined): number {
  const time = value ? Date.parse(value) : NaN;
  return Number.isNaN(time) ? 0 : time;
}

function resolveImage(url: string): string {
  for (const [placeholder, domain] of IMAGE_HOSTS)
    if (url.startsWith(placeholder)) return domain + url.slice(placeholder.length);
  if (url.startsWith('/cdn-readmanga/')) return `https://cdn.readmanga.cc${url.slice('/cdn-readmanga'.length)}`;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return BASE_URL + url;
  return url;
}

function cover(url: string | undefined): string | undefined {
  if (!url?.trim()) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return `https:${url}`;
  return `${BASE_URL}/${url.replace(/^\/+/, '')}`;
}

const toSummary = (m: MangaDto): MangaSummary => ({
  url: `/manga/${m.slug}`,
  title: m.title,
  thumbnailUrl: cover(m.coverImage),
});

/** The whole catalog is an object literal inside the app's main script. */
async function loadCatalog(): Promise<MangaDto[]> {
  const page = (await http.get(`${BASE_URL}/`, { headers })).body;
  const script = /<script[^>]*src="([^"]*assets\/main-[^"]+\.js)"/.exec(page)?.[1];
  if (!script) throw new Error('Main script not found');
  const source = (await http.get(absoluteUrl(BASE_URL, script), { headers })).body;
  for (const match of source.matchAll(/\[\{id\s*:/g)) {
    try {
      const candidate = parseJsLiteral(source, match.index!) as unknown as MangaDto[];
      if (candidate.length && candidate.every((m) => m.slug?.trim() && m.title?.trim())) {
        const seen = new Set<string>();
        return candidate.filter((m) => !seen.has(m.slug) && seen.add(m.slug));
      }
    } catch {
      // Not the catalog.
    }
  }
  throw new Error('Manga catalog not found');
}

const slugOf = (url: string) => url.split('/')[2] ?? '';

async function readChapters(slug: string): Promise<ChapterDto[]> {
  const response = await http.get(`${BASE_URL}/chapters/${slug}.json`, {
    headers: { ...headers, Accept: 'application/json' },
  });
  return JSON.parse(response.body) as ChapterDto[];
}

function status(text: string | undefined): MangaStatus {
  const s = normalizedStatus(text ?? '');
  return s === 'ongoing' || s === 'completed' || s === 'hiatus' || s === 'cancelled' ? s : 'unknown';
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (): Promise<MangaPage> => ({ items: (await loadCatalog()).map(toSummary), hasNextPage: false }),
    getLatest: async (): Promise<MangaPage> => ({
      items: (await loadCatalog())
        .sort((a, b) => timestamp(b.latestChapter?.releaseDate) - timestamp(a.latestChapter?.releaseDate))
        .map(toSummary),
      hasNextPage: false,
    }),
    async search(query: string, _page: number, filters: FilterState): Promise<MangaPage> {
      const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const wantedStatus = typeof filters.status === 'string' ? filters.status : '';
      const wantedGenres = GENRES.filter((g) => filters[`genre.${g}`] === true).map(normalizedGenre);
      let result = (await loadCatalog()).filter((m) => {
        const searchable = `${m.title} ${m.author ?? ''} ${m.slug}`.toLowerCase();
        if (!terms.every((t) => searchable.includes(t))) return false;
        if (wantedStatus && normalizedStatus(m.status ?? '') !== wantedStatus) return false;
        const genres = new Set((m.genres ?? []).map(normalizedGenre));
        return wantedGenres.every((g) => genres.has(g));
      });
      const sort = (filters.sort as { value?: string; ascending?: boolean } | undefined) ?? {};
      const by = (f: (m: MangaDto) => number | string) => (a: MangaDto, b: MangaDto) => {
        const x = f(a);
        const y = f(b);
        return x < y ? 1 : x > y ? -1 : 0;
      };
      if (sort.value === 'latest') result.sort(by((m) => timestamp(m.latestChapter?.releaseDate)));
      else if (sort.value === 'rating') result.sort(by((m) => m.rating ?? 0));
      else if (sort.value === 'title') result.sort(by((m) => m.title.toLowerCase()));
      else if (sort.value === 'release_year') result.sort(by((m) => m.releaseYear ?? 0));
      if (sort.ascending) result = result.reverse();
      return { items: result.map(toSummary), hasNextPage: false };
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [
          { label: 'All', value: '' },
          { label: 'Ongoing', value: 'ongoing' },
          { label: 'Completed', value: 'completed' },
          { label: 'Hiatus', value: 'hiatus' },
        ],
        default: '',
      },
      {
        type: 'sort',
        id: 'sort',
        label: 'Sort By',
        options: SORTS.map(([label, value]) => ({ label, value })),
        default: { value: 'default', ascending: false },
      },
      {
        type: 'group',
        id: 'genre',
        label: 'Genres',
        filters: GENRES.map((g) => ({ type: 'checkbox', id: `genre.${g}`, label: g })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const m = (await loadCatalog()).find((c) => c.slug === slugOf(manga.url));
      if (!m) return { ...manga, status: 'unknown' };
      return {
        ...toSummary(m),
        author: m.author?.trim() || undefined,
        description: m.description?.trim() || undefined,
        genres: m.genres ?? [],
        status: status(m.status),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const slug = slugOf(manga.url);
      const seen = new Set<string>();
      const chapters: Chapter[] = [];
      for (const c of await readChapters(slug)) {
        const id = `${c.id}|${c.number}`;
        if (!c.id || seen.has(id)) continue;
        seen.add(id);
        const number = String(c.number);
        chapters.push({
          url: `/manga/${slug}/chapter/${number}#${c.id}`,
          name: c.title?.trim() || `Chapter ${number}`,
          number: c.number,
          uploadedAt: timestamp(c.releaseDate) || undefined,
        });
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [path, id] = chapter.url.split('#');
      const parts = path!.split('/');
      const slug = parts[2] ?? '';
      const number = Number(parts[4]);
      const found = (await readChapters(slug)).find((c) => c.id === id && c.number === number);
      return (found?.pages ?? []).map((url, index) => ({ index, imageUrl: resolveImage(url) }));
    },
    // The image hosts reject the site's Referer.
    imageHeaders: () => ({
      'User-Agent': USER_AGENT,
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/manga\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/manga/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url.split('#')[0]!),
  }),
});
