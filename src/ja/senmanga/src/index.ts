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
import { USER_AGENT, hostOf } from './common/utils';

const BASE_URL = 'https://raw.senmanga.com';
const API = `${BASE_URL}/api`;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface SeriesDto {
  title: string;
  slug: string;
  cover?: string | null;
  status?: string | null;
  genre?: string | null;
  description?: string | null;
  chapterList?: { title: string; url: string; datetime?: string | null }[];
}
interface DirectoryResponse {
  currentPage?: number;
  totalPages?: number;
  series: SeriesDto[];
}

const slugOf = (url: string) => url.replace(/^\/manga\//, '');
const get = async <T>(url: string): Promise<T> => (await http.get<T>(url, { headers, responseType: 'json' })).body;

const summary = (s: SeriesDto): MangaSummary => ({
  url: `/manga/${s.slug}`,
  title: s.title,
  thumbnailUrl: s.cover ?? undefined,
});

function status(text: string | null | undefined): MangaStatus {
  const t = (text ?? '').toLowerCase();
  if (t.includes('ongoing')) return 'ongoing';
  if (t.includes('complete')) return 'completed';
  if (t.includes('hiatus')) return 'hiatus';
  if (t.includes('dropped')) return 'cancelled';
  return 'unknown';
}

const opts = (values: string[]) => values.map((v) => ({ label: v || 'All', value: v }));
const FILTERS: Filter[] = [
  {
    type: 'select',
    id: 'type',
    label: 'Type',
    options: [{ label: 'All', value: '' }, ...opts(['Manga', 'Manhua', 'Manhwa']).slice(1)],
    default: '',
  },
  { type: 'select', id: 'status', label: 'Status', options: opts(['', 'Ongoing', 'Completed']), default: '' },
  {
    type: 'select',
    id: 'order',
    label: 'Order',
    options: ['', 'A-Z', 'Z-A', 'Update', 'Added', 'Popular', 'Rating'].map((v) => ({
      label: v || 'Default',
      value: v,
    })),
    default: '',
  },
];

async function directory(page: number, query: string, filters: FilterState, order?: string): Promise<MangaPage> {
  const params = [`page=${page}`];
  if (query.trim()) params.push(`s=${encodeURIComponent(query)}`);
  for (const key of ['type', 'status', 'order']) {
    const value = filters[key];
    if (typeof value === 'string') params.push(`${key}=${encodeURIComponent(value)}`);
  }
  if (order && !params.some((p) => p.startsWith('order='))) params.push(`order=${order}`);
  const data = await get<DirectoryResponse>(`${API}/directory?${params.join('&')}`);
  return { items: data.series.map(summary), hasNextPage: (data.currentPage ?? 1) < (data.totalPages ?? 1) };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => directory(page, '', {}, 'Popular'),
    async getLatest(): Promise<MangaPage> {
      const data = await get<{ series: SeriesDto[] }>(`${API}/home`);
      return { items: data.series.map(summary), hasNextPage: false };
    },
    getFilters: () => FILTERS,
    search: (query, page, filters) => directory(page, query, filters),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const s = await get<SeriesDto>(`${API}/manga/${slugOf(manga.url)}`);
      return {
        ...summary(s),
        description: s.description ?? undefined,
        genres: s.genre
          ? s.genre
              .split(',')
              .map((g) => g.trim())
              .filter(Boolean)
          : undefined,
        status: status(s.status),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const s = await get<SeriesDto>(`${API}/manga/${slugOf(manga.url)}`);
      return (s.chapterList ?? []).map((c) => {
        const time = c.datetime ? Date.parse(c.datetime) : Number.NaN;
        return { url: `${s.slug}/${c.url}`, name: c.title, uploadedAt: Number.isNaN(time) ? undefined : time };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const data = await get<{ pages: string[] }>(`${API}/read/${chapter.url}`);
      return data.pages.map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const slug = /\/manga\/([^/?#]+)/.exec(url)?.[1];
      return hostOf(url) === hostOf(BASE_URL) && slug ? { url: `/manga/${slug}`, title: '' } : null;
    },
    getWebUrl(item): string {
      if ('name' in item)
        return `${BASE_URL}/manga/${item.url.split('/')[0]}/chapter-${item.url.split('/').slice(1).join('/')}/`;
      return BASE_URL + item.url;
    },
  }),
});
