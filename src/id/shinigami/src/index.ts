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
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://11.shinigami.asia';
const API_URL = 'https://api.shngm.io';

// Manga urls are "/series/<manga_id>" and chapter urls "/chapter/<chapter_id>", like the site's pages.

interface BrowseDto {
  data: { cover_image_url?: string | null; manga_id?: string | null; title?: string | null }[];
  meta: { page: number; total_page?: number | null };
}

interface DetailDto {
  data: {
    title?: string | null;
    cover_portrait_url?: string | null;
    cover_image_url?: string | null;
    alternative_title?: string | null;
    description?: string;
    status?: number;
    taxonomy?: Record<string, { name: string }[]>;
  };
}

interface ChapterListDto {
  data: { release_date?: string; chapter_title?: string; chapter_number?: number; chapter_id?: string }[];
}

interface PageListDto {
  data: { base_url: string; chapter: { path: string; data?: string[] } };
}

const apiHeaders = {
  'User-Agent': USER_AGENT,
  Referer: `${BASE_URL}/`,
  Accept: 'application/json',
  DNT: '1',
  'Sec-GPC': '1',
};

async function api<T>(path: string): Promise<T> {
  return (await http.get<T>(`${API_URL}${path}`, { headers: apiHeaders, responseType: 'json' })).body;
}

const id = (url: string) => url.replace(/\/+$/, '').split('/').pop() ?? '';

async function list(params: Record<string, string>): Promise<MangaPage> {
  const query = Object.entries({ page_size: '30', ...params })
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const result = await api<BrowseDto>(`/v1/manga/list?${query}`);
  return {
    items: result.data
      .filter((m) => m.manga_id)
      .map((m) => ({
        url: `/series/${m.manga_id}`,
        title: m.title ?? '',
        thumbnailUrl: m.cover_image_url || undefined,
      })),
    hasNextPage: result.meta.total_page != null && result.meta.page < result.meta.total_page,
  };
}

const option = (label: string, value: string) => ({ label, value });
const GENRES = [
  ['Action', 'action'], ['Adaptation', 'adaptation'], ['Adult', 'adult'], ['Adventure', 'adventure'],
  ['Comedy', 'comedy'], ['Cooking', 'cooking'], ['Crime', 'crime'], ['Demon', 'demon'], ['Demons', 'demons'],
  ['Dra', 'dra-genre'], ['Drama', 'drama'], ['Ecchi', 'ecchi'], ['Fantasy', 'fantasy'], ['Fight', 'fight'],
  ['Game', 'game'], ['Gender Bender', 'gender-bender'], ['Harem', 'harem'], ['Historical', 'historical'],
  ['Horror', 'horror'], ['Isekai', 'isekai'], ['Josei', 'josei-genre'], ['Latest', 'latest'], ['Love', 'love'],
  ['Magic', 'magic'], ['Martial Arts', 'martial-arts'], ['Mature', 'mature'], ['Mecha', 'mecha'],
  ['Medical', 'medical'], ['Murim', 'murim'], ['Mystery', 'mystery'], ['Philosophical', 'philosophical'],
  ['Psychological', 'psychological'], ['Regression', 'regression'], ['Revenge', 'revenge'], ['Romance', 'romance'],
  ['School Life', 'school-life'], ['Sci-fi', 'sci-fi'], ['Seinen', 'seinen'], ['Shoujo', 'shoujo'],
  ['Shounen', 'shounen'], ['Slice of Life', 'slice-of-life'], ['Smut', 'smut'], ['Sports', 'sports'],
  ['Supernatural', 'supernatural'], ['Supranatural', 'supranatural'], ['Thriller', 'thriller'],
  ['Tragedy', 'tragedy'], ['Violence', 'violence'], ['Wuxia', 'wuxia'],
]; // prettier-ignore

function filters(): Filter[] {
  return [
    {
      type: 'select',
      id: 'sort',
      label: 'Sort',
      options: [
        option('Default', ''),
        option('Latest', 'latest'),
        option('Popularity', 'popularity'),
        option('Rating', 'rating'),
      ],
    },
    {
      type: 'select',
      id: 'sort_order',
      label: 'Sort Order',
      options: [option('Descending', 'desc'), option('Ascending', 'asc')],
    },
    {
      type: 'select',
      id: 'status',
      label: 'Status',
      options: [
        option('All', ''),
        option('Ongoing', 'ongoing'),
        option('Completed', 'completed'),
        option('Hiatus', 'hiatus'),
      ],
    },
    {
      type: 'group',
      id: 'format',
      label: 'Format',
      filters: ['manga', 'manhwa', 'manhua'].map((v) => ({
        type: 'checkbox',
        id: `format.${v}`,
        label: v[0]!.toUpperCase() + v.slice(1),
      })),
    },
    {
      type: 'group',
      id: 'type',
      label: 'Type',
      filters: [
        { type: 'checkbox', id: 'type.project', label: 'Project' },
        { type: 'checkbox', id: 'type.mirror', label: 'Mirror' },
      ],
    },
    {
      type: 'group',
      id: 'genre',
      label: 'Genre',
      filters: GENRES.map(([label, value]) => ({ type: 'tristate', id: `genre.${value}`, label: label! })),
    },
  ];
}

function filterParams(state: FilterState): Record<string, string> {
  const params: Record<string, string> = {};
  for (const id of ['sort', 'sort_order', 'status']) {
    const value = state[id];
    if (typeof value === 'string' && value) params[id] = value;
  }
  const values = (prefix: string, wanted: unknown) =>
    Object.entries(state)
      .filter(([key, value]) => key.startsWith(prefix) && value === wanted)
      .map(([key]) => key.slice(prefix.length));
  const formats = values('format.', true);
  if (formats.length > 0) params.format = formats.join(',');
  const types = values('type.', true);
  if (types.length > 0) params.type = types.join(',');
  const included = values('genre.', 'include');
  if (included.length > 0) {
    params.genre_include = included.join(',');
    params.genre_include_mode = 'and';
  }
  const excluded = values('genre.', 'exclude');
  if (excluded.length > 0) {
    params.genre_exclude = excluded.join(',');
    params.genre_exclude_mode = 'and';
  }
  return params;
}

const STATUS: Record<number, MangaStatus> = { 1: 'ongoing', 2: 'completed', 3: 'hiatus' };

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    getPopular: (page) => list({ page: String(page), sort: 'popularity' }),

    getLatest: (page) => list({ page: String(page), sort: 'latest' }),

    search: (query, page, state) =>
      list({ page: String(page), ...(query.trim() ? { q: query.trim() } : {}), ...filterParams(state) }),

    getFilters: filters,

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { data } = await api<DetailDto>(`/v1/manga/detail/${id(manga.url)}`);
      const names = (key: string) => (data.taxonomy?.[key] ?? []).map((t) => t.name);
      let description = data.description ?? '';
      if (data.alternative_title?.trim()) {
        description += `${description ? '\n\n' : ''}Alternative Title: ${data.alternative_title}`;
      }
      const format = names('Format').join(' ').toLowerCase();
      return {
        url: manga.url,
        title: data.title?.trim() || manga.title,
        thumbnailUrl: data.cover_portrait_url || data.cover_image_url || manga.thumbnailUrl,
        author: names('Author').join(', ') || undefined,
        artist: names('Artist').join(', ') || undefined,
        status: STATUS[data.status ?? 0] ?? 'unknown',
        description: description || undefined,
        genres: [...names('Genre'), ...names('Format')],
        type: format.includes('manhwa')
          ? 'manhwa'
          : format.includes('manhua')
            ? 'manhua'
            : format.includes('manga')
              ? 'manga'
              : undefined,
      };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const result = await api<ChapterListDto>(`/v1/chapter/${id(manga.url)}/list?page_size=3000`);
      return result.data
        .filter((c) => c.chapter_id)
        .map((c) => {
          const uploadedAt = c.release_date ? Date.parse(c.release_date) : Number.NaN;
          return {
            url: `/chapter/${c.chapter_id}`,
            name: `Chapter ${String(c.chapter_number ?? 0).replace(/\.0$/, '')} ${c.chapter_title ?? ''}`.trim(),
            number: c.chapter_number,
            uploadedAt: Number.isFinite(uploadedAt) ? uploadedAt : undefined,
          };
        });
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const { data } = await api<PageListDto>(`/v1/chapter/detail/${id(chapter.url)}`);
      return (data.chapter.data ?? []).map((name, index) => ({
        index,
        imageUrl: `${data.base_url}${data.chapter.path}${name}`,
      }));
    },

    imageHeaders: () => ({
      'User-Agent': USER_AGENT,
      Referer: `${BASE_URL}/`,
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      DNT: '1',
      'Sec-GPC': '1',
    }),

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:[^/]+\.)?shinigami\.asia\/series\/([^/?#]+)/i.exec(url.trim());
      return match ? { url: `/series/${match[1]}`, title: '' } : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
