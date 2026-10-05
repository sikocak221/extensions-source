import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf } from './common/utils';

const BASE_URL = 'https://sinhsieusao.com';
const API_URL = `${BASE_URL}/api/v1`;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, Accept: 'application/json' };

interface WorkDto {
  id: number;
  kind: string;
  name: string;
  author_name?: string | null;
  description?: string | null;
  cover_url: string;
  tags?: { name: string }[];
  metadata?: { chapters_count?: number | null } | null;
  workable_id?: number | null;
}

interface WorksResponse {
  meta: { pagy: { page: number; pages: number } };
  items: WorkDto[];
}

async function api<T>(path: string): Promise<T> {
  return (await http.get<T>(API_URL + path, { headers, responseType: 'json' })).body;
}

const summary = (w: WorkDto): MangaSummary => ({
  url: `/works/${w.id}`,
  title: w.name,
  thumbnailUrl: BASE_URL + w.cover_url,
});
const workId = (url: string) => url.split('/')[2] ?? '';

async function works(params: string[]): Promise<MangaPage> {
  const result = await api<WorksResponse>(`/works?${['items=20', ...params].join('&')}`);
  return { items: result.items.map(summary), hasNextPage: result.meta.pagy.page < result.meta.pagy.pages };
}

const albumPath = (id: number) => `/albums/${id}?limit=200&offset=0&photos_sort=oldest`;

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const result = await api<{ items: WorkDto[] }>('/works/top?period=monthly');
      return { items: result.items.map(summary), hasNextPage: false };
    },
    getLatest: (page) => works([`page=${page}`]),
    async getFilters(): Promise<Filter[]> {
      const tags: { name: string; slug: string }[] = [];
      for (let page = 1, pages = 1; page <= pages && page <= 20; page++) {
        const result = await api<{ meta: { pagy: { pages: number } }; items: { name: string; slug: string }[] }>(
          `/tags?page=${page}`,
        ).catch(() => undefined);
        if (!result) break;
        tags.push(...result.items);
        pages = result.meta.pagy.pages;
      }
      return [
        {
          type: 'select',
          id: 'kind',
          label: 'Loại',
          default: '',
          options: [
            { label: 'Tất cả', value: '' },
            { label: 'Series', value: 'series' },
            { label: 'Oneshot', value: 'oneshot' },
            { label: 'Album ảnh', value: 'album-anh' },
            { label: 'Short Manga', value: 'short-manga' },
          ],
        },
        ...(tags.length
          ? [
              {
                type: 'group' as const,
                id: 'tags',
                label: 'Thể loại',
                filters: tags.map((t): Filter => ({ type: 'tristate', id: `tag.${t.slug}`, label: t.name })),
              },
            ]
          : []),
        {
          type: 'select',
          id: 'sort',
          label: 'Sắp xếp',
          default: '',
          options: [
            { label: 'Mới nhất', value: '' },
            { label: 'Phổ biến', value: 'views' },
            { label: 'Yêu thích', value: 'likes' },
          ],
        },
      ];
    },
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params = [`page=${page}`];
      if (query) params.push(`q=${encodeURIComponent(query)}`);
      if (typeof filters.kind === 'string' && filters.kind) params.push(`kind=${filters.kind}`);
      if (typeof filters.sort === 'string' && filters.sort) params.push(`sort=${filters.sort}`);
      for (const [id, value] of Object.entries(filters)) {
        if (!id.startsWith('tag.')) continue;
        if (value === 'include') params.push(`tag=${encodeURIComponent(id.slice(4))}`);
        if (value === 'exclude') params.push(`exclude_tag=${encodeURIComponent(id.slice(4))}`);
      }
      return works(params);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const w = await api<WorkDto>(`/works/${workId(manga.url)}`);
      return {
        ...summary(w),
        author: w.author_name || undefined,
        description: w.description || undefined,
        genres: (w.tags ?? []).map((t) => t.name),
        status: (w.metadata?.chapters_count ?? 0) > 0 ? 'ongoing' : 'completed',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const w = await api<WorkDto>(`/works/${workId(manga.url)}`);
      const target = w.workable_id ?? w.id;
      if (w.kind === 'album') {
        const album = await api<{ id: number; created_at: string }>(albumPath(target));
        const time = Date.parse(album.created_at);
        return [
          {
            url: `/works/${w.id}/album/${album.id}`,
            name: 'Oneshot',
            number: 1,
            uploadedAt: Number.isNaN(time) ? undefined : time,
          },
        ];
      }
      const manga2 = await api<{
        chapters: {
          id: number;
          name?: string | null;
          number: string;
          order: number;
          created_at: string;
          processing_status?: string | null;
        }[];
      }>(`/mangas/${target}`);
      return manga2.chapters
        .filter((c) => c.processing_status === 'processed')
        .sort((a, b) => b.order - a.order)
        .map((c) => {
          const time = Date.parse(c.created_at);
          return {
            url: `/works/${w.id}/chapters/${c.id}`,
            name: c.name?.trim() || `Chapter ${c.number}`,
            number: Number(c.number) || undefined,
            uploadedAt: Number.isNaN(time) ? undefined : time,
          };
        });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const album = /\/album\/(\d+)$/.exec(chapter.url)?.[1];
      const items = album
        ? (await api<{ photos: { order: number; image_url: string }[] }>(albumPath(Number(album)))).photos
        : (await api<{ pages: { order: number; image_url: string }[] }>(`/chapters/${chapter.url.split('/').pop()}`))
            .pages;
      return [...items]
        .sort((a, b) => a.order - b.order)
        .map((p, index) => ({ index, imageUrl: BASE_URL + p.image_url }));
    },
    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/works\/(\d+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/works/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url.replace(/\/album\/\d+$/, ''),
  }),
});
