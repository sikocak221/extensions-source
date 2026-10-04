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

const BASE_URL = 'https://mangatime.org';
const LIMIT = 24;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface SeriesListItem {
  id: string;
  title: string;
  slug: string;
  coverUrl: string;
  type: string;
}

interface SeriesDto {
  title: string;
  slug: string;
  coverUrl: string;
  type: string;
  genres?: { name: string }[] | null;
  description?: string | null;
  status?: string | null;
}

const toImage = (url: string) => {
  const escaped = url.replace(/ /g, '%20');
  return url.startsWith('http') ? escaped : `${BASE_URL}${escaped}`;
};

async function trpc<T>(endpoint: string, input: unknown): Promise<T> {
  const encoded = encodeURIComponent(JSON.stringify({ '0': { json: input } }));
  const response = await http.get(`${BASE_URL}/api/trpc/${endpoint}?batch=1&input=${encoded}`, { headers });
  const data = JSON.parse(response.body) as { result: { data: { json: T } } }[];
  return data[0]!.result.data.json;
}

async function searchSeries(page: number, sortBy: string, query?: string): Promise<MangaPage> {
  const result = await trpc<{ results: SeriesListItem[]; hasMore: boolean }>('search.searchSeries', {
    page,
    limit: LIMIT,
    sortBy,
    sortOrder: 'desc',
    ...(query ? { query } : {}),
  });
  return {
    items: result.results.map((s) => ({
      url: `/${s.type}/${s.slug}#${s.id}`,
      title: s.title,
      thumbnailUrl: toImage(s.coverUrl),
    })),
    hasNextPage: result.hasMore,
  };
}

const slugOf = (url: string) => url.split('#')[0]!.split('/')[2] ?? '';

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => searchSeries(page, 'popularity'),
    getLatest: (page) => searchSeries(page, 'recent'),
    search: (query, page) => searchSeries(page, 'popularity', query),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const dto = await trpc<SeriesDto>('content.getSeriesBySlug', { slug: slugOf(manga.url) });
      const statuses: Record<string, MangaStatus> = {
        ongoing: 'ongoing',
        completed: 'completed',
        hiatus: 'hiatus',
        cancelled: 'cancelled',
      };
      const genres = [...(dto.genres ?? []).map((g) => g.name), dto.type]
        .filter((g) => g.trim())
        .map((g) => g.replace(/،/g, ','));
      return {
        url: manga.url,
        title: dto.title,
        thumbnailUrl: toImage(dto.coverUrl),
        description: dto.description ?? undefined,
        genres: genres.length ? genres : undefined,
        status: statuses[(dto.status ?? '').toLowerCase()] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const [path, id] = manga.url.split('#');
      const result = await trpc<{
        chapters: { number: number | string; title: string; publishedAt?: string | null }[];
      }>('content.getChapters', { seriesId: id, limit: -1 });
      return result.chapters.map((chapter) => {
        const number = String(chapter.number);
        return {
          url: `${path}/chapter/${number}`,
          name: `${chapter.title.includes(number) ? '' : `Chapter ${number} - `}${chapter.title}`,
          number: Number(number) || undefined,
          uploadedAt: chapter.publishedAt ? Date.parse(chapter.publishedAt) || undefined : undefined,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const segments = chapter.url.split('/');
      const result = await trpc<{ pages: string[]; isUnlocked: boolean }>('content.getChapterPages', {
        seriesSlug: segments[2],
        chapterNumber: Number.parseInt(segments[4] ?? '', 10),
      });
      if (!result.isUnlocked) throw new Error('Chapter is locked');
      return result.pages.map((image, index) => ({ index, imageUrl: toImage(image) }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => `${BASE_URL}${item.url.replace(/#.*$/, '')}`,
  }),
});
