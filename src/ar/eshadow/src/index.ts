import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://eshadow.net';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface ChapterDto {
  id?: string | null;
  title?: string | null;
  number: number;
  images?: string[];
  publishedAt?: string | null;
}

interface MangaDto {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  coverImage?: string | null;
  author?: string | null;
  status?: string | null;
  chapters?: ChapterDto[];
}

async function api<T>(path: string): Promise<T> {
  const response = await http.get(`${BASE_URL}${path}`, { headers });
  return JSON.parse(response.body) as T;
}

// The API only knows ids, the site only slugs: urls keep both ("/manga/<slug>?id=<id>").
const toSummary = (dto: MangaDto): MangaSummary => ({
  url: `/manga/${dto.slug}?id=${dto.id}`,
  title: dto.title,
  thumbnailUrl: dto.coverImage ?? undefined,
});

const idOf = (url: string) => /[?&]id=([^&]+)/.exec(url)?.[1] ?? '';

async function list(page: number, query?: string): Promise<MangaPage> {
  const result = await api<{ data: MangaDto[]; limit: number; page: number; total: number }>(
    `/api/manga?page=${page}${query ? `&query=${encodeURIComponent(query)}` : ''}`,
  );
  return { items: result.data.map(toSummary), hasNextPage: result.page * result.limit < result.total };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(page),
    search: (query, page) => list(page, query),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const dto = await api<MangaDto>(`/api/manga/${idOf(manga.url)}`);
      const status: MangaStatus =
        dto.status === 'ONGOING'
          ? 'ongoing'
          : dto.status === 'COMPLETED'
            ? 'completed'
            : dto.status === 'HIATUS'
              ? 'hiatus'
              : 'unknown';
      return {
        ...toSummary(dto),
        description: dto.description ?? undefined,
        author: dto.author ?? undefined,
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const dto = await api<MangaDto>(`/api/manga/${idOf(manga.url)}`);
      return (dto.chapters ?? [])
        .filter((chapter) => chapter.id)
        .sort((a, b) => b.number - a.number)
        .map((chapter) => ({
          url: `/read/${chapter.id}?manga=${dto.id}`,
          name: `الفصل ${chapter.number}${chapter.title ? ` - ${chapter.title}` : ''}`,
          number: chapter.number,
          uploadedAt: chapter.publishedAt ? Date.parse(chapter.publishedAt) || undefined : undefined,
        }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const chapterId = /\/read\/([^?]+)/.exec(chapter.url)?.[1];
      const mangaId = /[?&]manga=([^&]+)/.exec(chapter.url)?.[1] ?? '';
      const dto = await api<MangaDto>(`/api/manga/${mangaId}`);
      const images = dto.chapters?.find((c) => c.id === chapterId)?.images ?? [];
      return images.map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => `${BASE_URL}${item.url.replace(/\?.*$/, '')}`,
  }),
});
