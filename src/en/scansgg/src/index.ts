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
import { USER_AGENT, absoluteUrl, hostOf, parseDate } from './common/utils';

const BASE_URL = 'https://scans.gg';
const API_URL = 'https://api.scans.gg';
const CDN_URL = 'https://cdn.scans.gg/uploads';
const POPULAR_LIMIT = 21;
const LATEST_LIMIT = 14;
const CHAPTER_LIMIT = 100;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const TYPES: [string, number][] = [
  ['Comic', 1],
  ['Manga', 2],
  ['Manhwa', 3],
  ['Manhua', 4],
  ['Webtoon', 5],
];

const STATUSES: [string, number][] = [
  ['Ongoing', 1],
  ['Completed', 2],
  ['Hiatus', 3],
  ['Cancelled', 4],
  ['Dropped', 5],
];

const TAGS: Record<number, string> = {
  1: 'Fantasy',
  2: 'Romance',
  3: 'Shoujo',
  4: 'Comedy',
  5: 'Drama',
  6: 'Slice Of Life',
  7: 'School Life',
  8: 'Thriller',
  9: 'Josei',
  10: 'Action',
  11: 'Seinen',
  12: 'Historical',
  13: 'Shounen',
  14: 'Sports',
  15: 'Supernatural',
  16: 'Adventure',
  17: 'Sci-fi',
  18: 'Martial Arts',
  19: 'Mystery',
  20: 'Horror',
  21: 'Mature',
  22: 'Psychological',
  23: 'Suspense',
  24: 'Gender Bender',
  25: 'Tragedy',
  26: 'Harem',
  27: 'Boys Love',
  28: 'Shounen Ai',
  29: 'Yaoi',
  30: 'Shoujo Ai',
  31: 'Yuri',
  32: 'Gourmet',
  33: 'Adult',
  34: 'Erotica',
  35: 'Smut',
  36: 'Music',
  37: 'Ecchi',
  38: 'Shotacon',
  39: 'Mecha',
  40: 'Hentai',
  41: 'Girls Love',
  42: 'Doujinshi',
  43: 'Mahou Shoujo',
  44: 'Lolicon',
  45: 'Award Winning',
  46: 'Avant Garde',
  47: 'Survival',
  48: 'Male Protagonist',
  49: 'Regression',
};

interface SeriesDto {
  id: number;
  title: string;
  summary?: string | null;
  cover?: string | null;
  author?: string[] | null;
  artist?: string[] | null;
  tags?: number[] | null;
  status?: number | null;
}

interface ChapterDto {
  id: number;
  number: number;
  title?: string | null;
  created_at?: string | null;
  group_id?: number | null;
  group?: { title?: string | null } | null;
}

interface Envelope<T> {
  data: T;
  meta?: { has_more?: boolean } | null;
}

async function api<T>(path: string): Promise<Envelope<T>> {
  return JSON.parse((await http.get(`${API_URL}${path}`, { headers })).body) as Envelope<T>;
}

const toSummary = (s: SeriesDto): MangaSummary => ({
  url: `/series/${s.id}`,
  title: s.title,
  thumbnailUrl: s.cover ? `${CDN_URL}/covers/${s.cover}` : undefined,
});

function status(code: number | null | undefined): MangaStatus {
  if (code === 1) return 'ongoing';
  if (code === 2) return 'completed';
  if (code === 3 || code === 4 || code === 5) return 'cancelled';
  return 'unknown';
}

async function seriesPage(page: number, extra: string[] = []): Promise<MangaPage> {
  const params = [`limit=${POPULAR_LIMIT}`, `offset=${(page - 1) * POPULAR_LIMIT}`, ...extra];
  // /series has no pagination meta; a full page means there may be more.
  const items = (await api<SeriesDto[]>(`/series?${params.join('&')}`)).data.map(toSummary);
  return { items, hasNextPage: items.length === POPULAR_LIMIT };
}

const idOf = (url: string) => url.split('/')[2]?.split('?')[0] ?? '';

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => seriesPage(page),
    async getLatest(page: number): Promise<MangaPage> {
      const result = await api<SeriesDto[]>(
        `/chapters?page=${page}&limit=${LATEST_LIMIT}&chapters=true&series_details=true&group_details=true&sort=date`,
      );
      return { items: result.data.map(toSummary), hasNextPage: result.meta?.has_more === true };
    },
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const picked = (group: string, ids: number[]) => ids.filter((id) => filters[`${group}.${id}`] === true);
      const params: string[] = [];
      if (query.trim()) params.push(`q=${encodeURIComponent(query.trim())}`);
      params.push(
        `q_type=${encodeURIComponent(
          `[${picked(
            'type',
            TYPES.map(([, id]) => id),
          ).join(',')}]`,
        )}`,
        `q_status=${encodeURIComponent(
          `[${picked(
            'status',
            STATUSES.map(([, id]) => id),
          ).join(',')}]`,
        )}`,
        `q_tags=${encodeURIComponent(`[${picked('tag', Object.keys(TAGS).map(Number)).join(',')}]`)}`,
      );
      return seriesPage(page, params);
    },
    getFilters: (): Filter[] => [
      {
        type: 'group',
        id: 'type',
        label: 'Type',
        filters: TYPES.map(([label, id]) => ({ type: 'checkbox', id: `type.${id}`, label })),
      },
      {
        type: 'group',
        id: 'status',
        label: 'Status',
        filters: STATUSES.map(([label, id]) => ({ type: 'checkbox', id: `status.${id}`, label })),
      },
      {
        type: 'group',
        id: 'tag',
        label: 'Tags',
        filters: Object.entries(TAGS)
          .sort(([, a], [, b]) => a.localeCompare(b))
          .map(([id, label]) => ({ type: 'checkbox', id: `tag.${id}`, label })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { data: s } = await api<SeriesDto>(`/series?id=${idOf(manga.url)}&trackers=true&sources=true`);
      return {
        ...toSummary(s),
        description: s.summary || undefined,
        author: s.author?.join(', ') || undefined,
        artist: s.artist?.join(', ') || undefined,
        genres: (s.tags ?? []).flatMap((t) => TAGS[t] ?? []),
        status: status(s.status),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const id = idOf(manga.url);
      const chapters: Chapter[] = [];
      for (let page = 1, more = true; more; page++) {
        const result = await api<ChapterDto[]>(
          `/chapters?series_id=${id}&limit=${CHAPTER_LIMIT}&page=${page}&group_details=true`,
        );
        for (const c of result.data)
          chapters.push({
            url: `/series/${id}?chapter=${c.id}&group=${c.group_id ?? 0}`,
            name: `Chapter ${c.number}${c.title ? ` - ${c.title}` : ''}`,
            number: c.number,
            uploadedAt: parseDate(c.created_at, 'yyyy-MM-dd HH:mm:ss'),
            scanlator: c.group?.title || undefined,
          });
        more = result.meta?.has_more === true;
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const query = chapter.url.split('?')[1] ?? '';
      const param = (name: string) => new RegExp(`(?:^|&)${name}=([^&]*)`).exec(query)?.[1];
      const { data } = await api<{ chapter?: { id?: number; pages?: { position: number; path: string }[] } | null }>(
        `/chapter-navigation?series_id=${idOf(chapter.url)}&chapter_id=${param('chapter')}&group_id=${param('group') ?? 0}`,
      );
      const id = data.chapter?.id;
      if (id == null) return [];
      return (data.chapter?.pages ?? []).map((p) => ({
        index: p.position,
        imageUrl: `${CDN_URL}/pages/${id}/${p.path}`,
      }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/series\/(\d+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/series/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url.split('?')[0]!),
  }),
});
