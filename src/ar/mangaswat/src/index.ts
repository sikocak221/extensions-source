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

const BASE_URL = 'https://meshmanga.com';
const API_URL = `${BASE_URL}/v2/api/v2`;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface MangaDto {
  id?: number | null;
  serie_id?: number | null;
  title: string;
  poster: { medium: string };
}

interface DetailsDto extends MangaDto {
  genres?: { name: string }[];
  story?: string | null;
  author?: { name: string } | null;
  artist?: { name: string } | null;
  status?: { name: string } | null;
}

interface ChapterListDto {
  results: { id: number; slug: string; chapter: string; created_at: string }[];
  next?: string | null;
}

async function api<T>(url: string): Promise<T> {
  const response = await http.get(url.startsWith('http') ? url : `${API_URL}${url}`, { headers });
  return JSON.parse(response.body) as T;
}

const idOf = (dto: MangaDto) => String(dto.id ?? dto.serie_id);

const toSummary = (dto: MangaDto): MangaSummary => ({
  url: `/series/${idOf(dto)}`,
  title: dto.title,
  thumbnailUrl: dto.poster.medium,
});

async function list(path: string): Promise<MangaPage> {
  const data = await api<{ results: MangaDto[]; next?: string | null }>(path);
  return { items: data.results.map(toSummary), hasNextPage: data.next != null };
}

const seriesId = (url: string) => url.replace(/^\/series\//, '').replace(/\/.*$/, '');
const chapterId = (url: string) => url.replace(/^\/chapters\//, '').split('/')[0];

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`/series/?order_by=-followers_count&page=${page}`),
    getLatest: (page) => list(`/series/releases/?page=${page}`),
    search: (query, page) => list(`/series/?search=${encodeURIComponent(query)}&page=${page}`),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const dto = await api<DetailsDto>(`/series/${seriesId(manga.url)}/`);
      const status: MangaStatus =
        dto.status?.name === 'ongoing' ? 'ongoing' : dto.status?.name === 'completed' ? 'completed' : 'unknown';
      return {
        url: manga.url,
        title: dto.title,
        thumbnailUrl: dto.poster.medium,
        description: dto.story ?? undefined,
        genres: dto.genres?.map((g) => g.name),
        author: dto.author?.name,
        artist: dto.artist?.name,
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const chapters: Chapter[] = [];
      let next: string | null | undefined = `/chapters/?serie=${seriesId(manga.url)}&order_by=-order&page_size=200`;
      while (next) {
        const data: ChapterListDto = await api<ChapterListDto>(next);
        for (const chapter of data.results) {
          chapters.push({
            url: `/chapters/${chapter.id}/${chapter.slug}/`,
            name: chapter.chapter,
            uploadedAt: Date.parse(chapter.created_at) || undefined,
          });
        }
        next = data.next;
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const data = await api<{ images: { image: string }[] }>(`/chapters/${chapterId(chapter.url)}/`);
      return data.images.map((page, index) => ({ index, imageUrl: page.image }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?meshmanga\.com\/series\/(\d+)/i.exec(url.trim());
      return match ? { url: `/series/${match[1]}`, title: '' } : null;
    },
    getWebUrl: (item) =>
      item.url.startsWith('/chapters/') ? `${BASE_URL}/chapter/${chapterId(item.url)}` : `${BASE_URL}${item.url}`,
  }),
});
