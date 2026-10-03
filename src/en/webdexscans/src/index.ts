import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, htmlToText } from './common/utils';

const BASE_URL = 'https://webdexscans.com';
const SUPABASE_URL = 'https://nrqghtbdrdnoywxjkgkf.supabase.co/rest/v1';
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ycWdodGJkcmRub3l3eGprZ2tmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4Njg4NDEsImV4cCI6MjA5MjQ0NDg0MX0.Gnrn33_LMxFA9m_OdCpybBZ-Cjcc5rdsJlD8Y9eOICg';
const PAGE_SIZE = 24;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const apiHeaders = {
  ...headers,
  apikey: SUPABASE_KEY,
  authorization: `Bearer ${SUPABASE_KEY}`,
  Accept: 'application/json',
};

const SHOW_PREMIUM_PREFERENCE: Preference = {
  type: 'switch',
  key: 'pref_show_premium',
  label: 'Show premium chapters (they require coins to read)',
  default: false,
};

type Options = [string, string][];

const GENRES: Options = [
  ['All Genres', ''],
  ['Action', 'action'],
  ['Adventure', 'adventure'],
  ['Comedy', 'comedy'],
  ['Drama', 'drama'],
  ['Fantasy', 'fantasy'],
  ['Isekai', 'isekai'],
  ['Martial Arts', 'martial-arts'],
  ['Mystery', 'mystery'],
  ['Romance', 'romance'],
  ['Sci-Fi', 'sci-fi'],
  ['Seinen', 'seinen'],
  ['Shounen', 'shounen'],
  ['Slice of Life', 'slice-of-life'],
  ['Supernatural', 'supernatural'],
];

const TYPES: Options = [
  ['All Types', ''],
  ['Manhwa', 'manhwa'],
  ['Manga', 'manga'],
  ['Manhua', 'manhua'],
  ['Webtoon', 'webtoon'],
];

const STATUSES: Options = [
  ['All Status', ''],
  ['Ongoing', 'ongoing'],
  ['Completed', 'completed'],
  ['Hiatus', 'hiatus'],
];

const SORTS: Options = [
  ['Latest Update', 'latest'],
  ['Most Popular', 'popular'],
  ['Highest Rating', 'rating'],
  ['Alphabetical', 'a-z'],
];

const ORDERS: Record<string, string> = {
  popular: 'view_count.desc',
  rating: 'rating.desc',
  'a-z': 'title.asc',
  latest: 'updated_at.desc',
};

interface SeriesDto {
  id: string;
  slug: string;
  title: string;
  cover_url?: string | null;
  description?: string | null;
  author?: string | null;
  artist?: string | null;
  status?: string | null;
  genres?: { name: string }[] | null;
}

interface ChapterDto {
  id: string;
  slug: string;
  title?: string | null;
  chapter_number?: number | null;
  created_at?: string | null;
  is_premium?: boolean;
  free_at?: string | null;
}

async function api<T>(path: string, params: Record<string, string>): Promise<T> {
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return JSON.parse((await http.get(`${SUPABASE_URL}/${path}?${query}`, { headers: apiHeaders })).body) as T;
}

const absolute = (url: string | null | undefined) => (url ? (url.startsWith('/') ? BASE_URL + url : url) : undefined);

const toSummary = (s: SeriesDto): MangaSummary => ({
  url: `/series/${s.slug}`,
  title: s.title,
  thumbnailUrl: absolute(s.cover_url),
});

async function seriesList(page: number, params: Record<string, string>): Promise<MangaPage> {
  const items = (
    await api<SeriesDto[]>('series', {
      select: 'id,title,slug,cover_url',
      ...params,
      offset: String((page - 1) * PAGE_SIZE),
      limit: String(PAGE_SIZE),
    })
  ).map(toSummary);
  return { items, hasNextPage: items.length === PAGE_SIZE };
}

function isPremium(c: ChapterDto): boolean {
  if (!c.is_premium) return false;
  const freeAt = c.free_at ? Date.parse(c.free_at) : NaN;
  return Number.isNaN(freeAt) || freeAt > Date.now();
}

function status(text: string | null | undefined): MangaStatus {
  const s = text?.toLowerCase();
  return s === 'ongoing' || s === 'completed' || s === 'hiatus' || s === 'cancelled' ? s : 'unknown';
}

const slugOf = (url: string) => url.split('/')[2] ?? '';

export default defineExtension({
  preferences: () => [SHOW_PREMIUM_PREFERENCE],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => seriesList(page, { order: 'view_count.desc' }),
    getLatest: (page) => seriesList(page, { order: 'updated_at.desc' }),
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const value = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');
      const params: Record<string, string> = {};
      if (value('genre')) {
        params.select = 'id,title,slug,cover_url,genres!inner(slug)';
        params['genres.slug'] = `eq.${value('genre')}`;
      }
      if (query.trim()) params.title = `ilike.%${query.trim()}%`;
      if (value('type')) params.type = `eq.${value('type')}`;
      if (value('status')) params.status = `eq.${value('status')}`;
      params.order = ORDERS[value('sort') || 'latest'] ?? ORDERS.latest!;
      return seriesList(page, params);
    },
    getFilters: (): Filter[] =>
      (
        [
          ['genre', 'Genre', GENRES],
          ['type', 'Type', TYPES],
          ['status', 'Status', STATUSES],
          ['sort', 'Sort By', SORTS],
        ] as const
      ).map(([id, label, options]) => ({
        type: 'select',
        id,
        label,
        options: options.map(([l, v]) => ({ label: l, value: v })),
        default: options[0]![1],
      })),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const [s] = await api<SeriesDto[]>('series', { slug: `eq.${slugOf(manga.url)}`, select: '*,genres(name)' });
      if (!s) throw new Error('Series not found');
      return {
        ...toSummary(s),
        author: s.author || undefined,
        artist: s.artist || undefined,
        description: s.description
          ? htmlToText(s.description.replace(/<\/(?:p|div|h[1-6])>/gi, '\n'))
              .replace(/ /g, ' ')
              .replace(/[ \t\r]*\n[ \t\r]*/g, '\n')
              .replace(/\n{3,}/g, '\n\n')
              .trim()
          : undefined,
        status: status(s.status),
        genres: (s.genres ?? []).map((g) => g.name),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const slug = slugOf(manga.url);
      const [s] = await api<(SeriesDto & { chapters?: ChapterDto[] })[]>('series', {
        slug: `eq.${slug}`,
        select: 'id,slug,chapters(id,chapter_number,title,slug,created_at,is_premium,free_at)',
        'chapters.order': 'chapter_number.desc',
      });
      const showPremium = prefs.get<boolean>(SHOW_PREMIUM_PREFERENCE.key) ?? false;
      return (s?.chapters ?? [])
        .filter((c) => showPremium || !isPremium(c))
        .map((c) => {
          const name = c.title?.trim() || (c.chapter_number != null ? `Chapter ${c.chapter_number}` : 'Chapter');
          const locked = isPremium(c);
          const date = c.created_at ? Date.parse(c.created_at) : NaN;
          return {
            url: `/series/${slug}/${c.slug}#${c.id}${locked ? ':locked' : ''}`,
            name: locked ? `🔒 ${name}` : name,
            number: c.chapter_number ?? undefined,
            uploadedAt: Number.isNaN(date) ? undefined : date,
          };
        });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [id, locked] = (chapter.url.split('#')[1] ?? '').split(':');
      if (locked) return [];
      const pages = await api<{ image_url: string }[]>('pages', {
        chapter_id: `eq.${id}`,
        select: 'image_url,page_number',
        order: 'page_number.asc',
      });
      return pages.map((p, index) => ({ index, imageUrl: absolute(p.image_url) ?? '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/series\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/series/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url.split('#')[0]!),
  }),
});
