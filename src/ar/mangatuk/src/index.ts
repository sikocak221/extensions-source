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

const BASE_URL = 'https://mangatuk.com';
const API_URL = 'https://api.mangatuk.com/api';
const PAGE_SIZE = 30;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const SORTS = [
  { label: 'الأكثر شعبية', value: 'popular' },
  { label: 'الرائج', value: 'trending' },
  { label: 'آخر التحديثات', value: 'latest_updates' },
  { label: 'الأحدث', value: 'latest' },
  { label: 'أبجدي', value: 'alphabetical' },
  { label: 'التقييم', value: 'rating' },
];
const STATUSES = [
  { label: 'الكل', value: '' },
  { label: 'مستمر', value: 'ongoing' },
  { label: 'مكتمل', value: 'completed' },
  { label: 'متوقف', value: 'hiatus' },
  { label: 'ملغي', value: 'cancelled' },
];

interface SeriesDto {
  id: string;
  slug: string;
  title: string;
  coverImage?: string | null;
  associatedNames?: string | null;
  description?: string | null;
  author?: string | null;
  status?: string | null;
  type?: string | null;
  genres?: { name: string }[];
  chapters?: {
    id: string;
    number: string;
    title?: string | null;
    slug: string;
    publishedAt?: string | null;
    coinAccess?: { locked?: boolean };
  }[];
}

async function api<T>(path: string): Promise<T> {
  const response = await http.get(`${API_URL}${path}`, { headers });
  return JSON.parse(response.body) as T;
}

const toSummary = (dto: SeriesDto): MangaSummary => ({
  url: `/series/${dto.slug}`,
  title: dto.title,
  thumbnailUrl: dto.coverImage ?? undefined,
});

async function search(page: number, query: string, sort: string, status?: string): Promise<MangaPage> {
  const params = [
    ...(query.trim() ? [`q=${encodeURIComponent(query.trim())}`] : []),
    `sort=${sort}`,
    ...(status ? [`status=${status}`] : []),
    `limit=${PAGE_SIZE}`,
    `offset=${(page - 1) * PAGE_SIZE}`,
  ];
  const result = await api<{ data: SeriesDto[]; total: number }>(`/catalog/search?${params.join('&')}`);
  return { items: result.data.map(toSummary), hasNextPage: page * PAGE_SIZE < result.total };
}

const slugOf = (url: string) => url.replace(/^\/series\//, '').replace(/\/.*$/, '');
const pick = (filters: FilterState, id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => search(page, '', 'popular'),
    getLatest: (page) => search(page, '', 'latest_updates'),
    getFilters: (): Filter[] => [
      { type: 'select', id: 'sort', label: 'ترتيب حسب', options: SORTS, default: 'popular' },
      { type: 'select', id: 'status', label: 'الحالة', options: STATUSES, default: '' },
    ],
    search: (query, page, filters) =>
      search(page, query, pick(filters, 'sort') || 'popular', pick(filters, 'status') || undefined),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const dto = await api<SeriesDto>(`/catalog/series/by-slug/${slugOf(manga.url)}`);
      const statuses: Record<string, MangaStatus> = {
        ongoing: 'ongoing',
        completed: 'completed',
        hiatus: 'hiatus',
        cancelled: 'cancelled',
      };
      const alt = dto.associatedNames?.trim();
      const description = [dto.description, alt ? `أسماء أخرى:\n${alt}` : ''].filter(Boolean).join('\n\n');
      const genres = [...(dto.type ? [dto.type] : []), ...(dto.genres ?? []).map((g) => g.name)];
      return {
        ...toSummary(dto),
        author: dto.author || undefined,
        description: description || undefined,
        genres: genres.length ? genres : undefined,
        status: statuses[dto.status ?? ''] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const dto = await api<SeriesDto>(`/catalog/series/by-slug/${slugOf(manga.url)}`);
      return (dto.chapters ?? [])
        .filter((chapter) => !chapter.coinAccess?.locked)
        .map((chapter) => ({
          url: `/series/${dto.slug}/${chapter.slug}#${chapter.id}`,
          name: `الفصل ${chapter.number}${chapter.title?.trim() ? ` - ${chapter.title}` : ''}`,
          number: Number(chapter.number) || undefined,
          uploadedAt: chapter.publishedAt ? Date.parse(chapter.publishedAt) || undefined : undefined,
        }))
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const id = chapter.url.slice(chapter.url.lastIndexOf('#') + 1);
      const pages = await api<{ imageUrl: string }[]>(`/catalog/chapters/${id}/pages`);
      return pages.map((page, index) => ({ index, imageUrl: page.imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/(?:series|manga)\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase().replace(/^www\./, '') === hostOf(BASE_URL)
        ? { url: `/series/${match[2]}`, title: '' }
        : null;
    },
    getWebUrl: (item) => `${BASE_URL}${item.url.replace(/#.*$/, '')}`,
  }),
});
