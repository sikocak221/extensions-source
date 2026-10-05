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
import { USER_AGENT, absoluteUrl } from './common/utils';

const BASE_URL = 'https://9grid.cc';
const API = `${BASE_URL}/api/external/v1`;
const PREF_API_KEY = 'pref_api_key';

const SORTS = [
  ['popular', 'По популярности'],
  ['latest', 'По новизне'],
  ['name', 'По названию'],
  ['year', 'По году'],
] as const;
const GENRES = [
  'Adult',
  'Crime',
  'Espionage',
  'Fantasy',
  'Historical',
  'Horror',
  'Humor',
  'Manga',
  'Martial Arts',
  'Math & Science',
  'Military',
  'Mystery',
  'Mythology',
  'Political',
  'Post-Apocalyptic',
  'Psychological',
  'Pulp',
  'Romance',
  'School Life',
  'Sci-Fi',
  'Slice of Life',
  'Spy',
  'Superhero',
  'Supernatural',
  'Thriller',
  'War',
  'Western',
];

interface SeriesDto {
  id: number;
  name: string;
  description?: string | null;
  publisherName?: string | null;
  genres?: string[];
  status?: string | null;
}

function headers(): Record<string, string> {
  const key = (prefs.get<string>(PREF_API_KEY) ?? '').trim();
  return { 'User-Agent': USER_AGENT, Accept: 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) };
}

async function api<T>(path: string): Promise<T> {
  return (await http.get<T>(`${API}${path}`, { headers: headers(), responseType: 'json' })).body;
}

const enc = encodeURIComponent;
const idOf = (url: string) => /\/series\/([^/?#]+)/.exec(url)?.[1] ?? url;

function summary(s: SeriesDto): MangaSummary {
  return { url: `/series/${s.id}`, title: s.name, thumbnailUrl: `${API}/series/${s.id}/thumbnail` };
}

async function list(params: [string, string][], page: number): Promise<MangaPage> {
  const all: [string, string][] = [['page', String(page - 1)], ['size', '20'], ...params];
  const data = await api<{ content: SeriesDto[]; page: number; totalPages: number }>(
    `/series?${all.map(([k, v]) => `${k}=${enc(v)}`).join('&')}`,
  );
  return { items: data.content.map(summary), hasNextPage: data.page + 1 < data.totalPages };
}

export default defineExtension({
  preferences: () => [
    { type: 'text', key: PREF_API_KEY, label: 'API-ключ', description: 'Для трекинга прогресса', default: '' },
  ],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list([['sort', 'popular']], page),
    getLatest: (page) => list([['sort', 'latest']], page),
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params: [string, string][] = [['q', query.trim()]];
      if (typeof filters.sort === 'string' && filters.sort) params.push(['sort', filters.sort]);
      for (const id of ['publisher', 'year'] as const) {
        const value = filters[id];
        if (typeof value === 'string' && value.trim()) params.push([id, value.trim()]);
      }
      for (const genre of GENRES) if (filters[`genre.${genre}`] === true) params.push(['genre', genre]);
      return list(params, page);
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'sort',
        label: 'Сортировка',
        options: SORTS.map(([value, label]) => ({ value, label })),
        default: 'popular',
      },
      { type: 'text', id: 'publisher', label: 'Издатель' },
      { type: 'text', id: 'year', label: 'Год начала' },
      {
        type: 'group',
        id: 'genres',
        label: 'Жанры',
        filters: GENRES.map((genre): Filter => ({ type: 'checkbox', id: `genre.${genre}`, label: genre })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const s = await api<SeriesDto>(`/series/${idOf(manga.url)}`);
      const status: MangaStatus =
        s.status === 'Continuing' ? 'ongoing' : s.status === 'Ended' ? 'completed' : 'unknown';
      return {
        ...summary(s),
        description: s.description ?? undefined,
        author: s.publisherName ?? undefined,
        genres: s.genres,
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const data = await api<{
        issues: {
          id: number;
          number: string;
          name?: string | null;
          translations: { id: string; teamNames?: string[]; pageCount?: number; createdAt?: string | null }[];
        }[];
      }>(`/series/${idOf(manga.url)}/issues`);
      const chapters: Chapter[] = [];
      for (const issue of data.issues) {
        for (const t of issue.translations) {
          const team = t.teamNames?.length ? t.teamNames.join(', ') : undefined;
          let name = `#${issue.number}`;
          if (issue.name?.trim()) name += ` — ${issue.name}`;
          if (issue.translations.length > 1 && team) name += ` [${team}]`;
          const time = t.createdAt ? Date.parse(t.createdAt.replace(/(\.\d{3})\d+/, '$1')) : Number.NaN;
          chapters.push({
            url: `/translations/${t.id}/pages`,
            name,
            number: Number.parseFloat(issue.number.replace(/^annual\s*/i, '1000.')) || undefined,
            scanlator: team,
            uploadedAt: Number.isNaN(time) ? undefined : time,
          });
        }
      }
      return chapters.reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const data = await api<{ pages: { index: number; url: string }[] }>(chapter.url);
      return data.pages.map((p) => ({ index: p.index, imageUrl: p.url }));
    },
    imageHeaders: () => headers(),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?9grid\.cc\/series\/(\d+)/i.exec(url.trim());
      return match ? { url: `/series/${match[1]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
