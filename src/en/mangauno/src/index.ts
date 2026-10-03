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
import { USER_AGENT, absoluteUrl, decodeEntities, hostOf } from './common/utils';

const BASE_URL = 'https://manga.uno';
const API_URL = `${BASE_URL}/api`;
const IMG_API_URL = 'https://xz7.fstr-cdn.com';
const PAGE_SIZE = 24;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const TITLE_PREFERENCE: Preference = {
  type: 'select',
  key: 'PREF_TITLE_LANG',
  label: 'Title Language',
  options: [
    { label: 'English Title', value: 'english' },
    { label: 'Japanese Title', value: 'japanese' },
  ],
  default: 'english',
};

type Options = [string, string][];

const TYPES: Options = [
  ['All', ''],
  ['Manga', 'manga'],
  ['Manhwa', 'manhwa'],
  ['Manhua', 'manhua'],
  ['Webtoon', 'webtoon'],
];

const STATUSES: Options = [
  ['All', ''],
  ['Ongoing', 'ongoing'],
  ['Completed', 'completed'],
  ['Hiatus', 'hiatus'],
  ['Cancelled', 'cancelled'],
];

const SORTS: Options = [
  ['Popularity', 'popularity'],
  ['Score', 'score'],
  ['Latest chapter', 'latest'],
  ['A–Z', 'az'],
  ['Newest added', 'newest'],
  ['Oldest added', 'oldest'],
];

interface MangaDto {
  slug: string;
  title: string;
  english_title?: string | null;
  japanese_title?: string | null;
  cover?: string | null;
}

interface MangaDetailsDto extends MangaDto {
  synopsis?: string | null;
  author?: string | null;
  artist?: string | null;
  genres?: string | null;
  tags?: string | null;
  status?: string | null;
}

interface ChapterDto {
  id: number;
  chapter_number?: string | null;
  volume?: number | null;
  title?: string | null;
  source?: string | null;
  published_at?: string | null;
}

async function api<T>(path: string): Promise<T> {
  return JSON.parse((await http.get(`${API_URL}${path}`, { headers })).body) as T;
}

function toSummary(m: MangaDto): MangaSummary {
  const english = (prefs.get<string>(TITLE_PREFERENCE.key) ?? 'english') === 'english';
  return {
    url: `/m/${m.slug}`,
    title: (english ? m.english_title : m.japanese_title) || m.title,
    thumbnailUrl: m.cover ? IMG_API_URL + m.cover : undefined,
  };
}

async function list(path: string): Promise<MangaPage> {
  const items = (await api<{ data: MangaDto[] }>(path)).data.map(toSummary);
  return { items, hasNextPage: items.length >= PAGE_SIZE };
}

function parseList(json: string | null | undefined): string[] {
  try {
    return json ? (JSON.parse(json) as string[]) : [];
  } catch {
    return [];
  }
}

function status(text: string | null | undefined): MangaStatus {
  const s = text?.toLowerCase();
  return s === 'ongoing' || s === 'completed' || s === 'hiatus' || s === 'cancelled' ? s : 'unknown';
}

const slugOf = (url: string) => url.split('/')[2] ?? '';

export default defineExtension({
  preferences: () => [TITLE_PREFERENCE],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`/list/popular?page=${page}&limit=${PAGE_SIZE}`),
    getLatest: (page) => list(`/list/latest?page=${page}&limit=${PAGE_SIZE}`),
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params = [`page=${page}`, `limit=${PAGE_SIZE}`];
      if (query.trim()) params.push(`title=${encodeURIComponent(query.trim())}`);
      const value = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string).trim() : '');
      if (value('types')) params.push(`types=${value('types')}`);
      if (value('statuses')) params.push(`statuses=${value('statuses')}`);
      if (value('sort')) params.push(`sort=${value('sort')}`);
      if (value('yearMin')) params.push(`yearMin=${encodeURIComponent(value('yearMin'))}`);
      if (value('yearMax')) params.push(`yearMax=${encodeURIComponent(value('yearMax'))}`);
      if (filters.adult === true) params.push('adult=1');
      for (const group of ['genres', 'tags']) {
        const picked = Object.entries(filters)
          .filter(([id, v]) => id.startsWith(`${group}.`) && v === true)
          .map(([id]) => id.slice(group.length + 1));
        if (picked.length) params.push(`${group}=${encodeURIComponent(picked.join(','))}`);
      }
      return list(`/search/advanced?${params.join('&')}`);
    },
    async getFilters(): Promise<Filter[]> {
      const select = (id: string, label: string, options: Options): Filter => ({
        type: 'select',
        id,
        label,
        options: options.map(([l, v]) => ({ label: l, value: v })),
        default: options[0]![1],
      });
      const filters: Filter[] = [
        { type: 'checkbox', id: 'adult', label: 'Include adult (18+)' },
        select('types', 'Type', TYPES),
        select('statuses', 'Status', STATUSES),
        select('sort', 'Sort', SORTS),
        { type: 'text', id: 'yearMin', label: 'Year min' },
        { type: 'text', id: 'yearMax', label: 'Year max' },
      ];
      const response = await http.request<string>({ url: `${API_URL}/search/facets`, headers });
      if (response.status !== 200) return filters;
      const facets = JSON.parse(response.body) as { genres?: { name: string }[]; tags?: { name: string }[] };
      for (const [id, label, items] of [
        ['genres', 'Genres', facets.genres ?? []],
        ['tags', 'Tags', facets.tags ?? []],
      ] as const) {
        if (items.length)
          filters.push({
            type: 'group',
            id,
            label,
            filters: items.map((f) => ({ type: 'checkbox', id: `${id}.${f.name}`, label: f.name })),
          });
      }
      return filters;
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { manga: m } = await api<{ manga: MangaDetailsDto }>(`/manga/${slugOf(manga.url)}`);
      return {
        ...toSummary(m),
        description: m.synopsis || undefined,
        author: m.author?.replace(/ & /g, ', ') || undefined,
        artist: m.artist?.replace(/ & /g, ', ') || undefined,
        genres: [...parseList(m.genres), ...parseList(m.tags)].filter(Boolean),
        status: status(m.status),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const slug = slugOf(manga.url);
      const { chapters } = await api<{ chapters: ChapterDto[] }>(`/manga/${slug}`);
      return chapters.map((c) => {
        const parsed = Number.parseFloat(c.chapter_number ?? '');
        const parts = [
          Number.isNaN(parsed) ? null : `Ch. ${parsed}`,
          c.volume != null ? `Vol. ${c.volume}` : null,
          c.title ? decodeEntities(c.title) : null,
        ].filter((p): p is string => !!p);
        const date = c.published_at ? Date.parse(c.published_at) : NaN;
        return {
          url: `/r/${slug}/${c.id}`,
          name: parts.join(' — ') || 'Chapter',
          scanlator: c.source || undefined,
          uploadedAt: Number.isNaN(date) ? undefined : date,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { pages } = await api<{ pages: string[] }>(`/chapter/${chapter.url.split('/').pop()}`);
      return pages.map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/(?:m|r)\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/m/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
