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
import { USER_AGENT, absoluteUrl, hostOf } from './common/utils';

const BASE_URL = 'https://mangtto.com';
const API_URL = `${BASE_URL}/api/manga`;
const PAGE_SIZE = 50;
const SEARCH_PAGE_SIZE = 42;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface MangaDto {
  title: string;
  slug: string;
  coverImage?: string | null;
}

async function api<T>(url: string): Promise<T> {
  const response = await http.get(url.startsWith('http') ? url : `${API_URL}${url}`, { headers });
  return JSON.parse(response.body) as T;
}

const toSummary = (dto: MangaDto): MangaSummary => ({
  url: `/manga/${dto.slug}`,
  title: dto.title,
  thumbnailUrl: dto.coverImage ?? undefined,
});

const slugOf = (url: string) => url.replace(/^\/manga\//, '').replace(/[/?#].*$/, '');

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(page): Promise<MangaPage> {
      const skip = (page - 1) * PAGE_SIZE;
      const data = await api<{ mangas: MangaDto[]; total: number }>(`/populer?skip=${skip}&take=${PAGE_SIZE}`);
      return { items: data.mangas.map(toSummary), hasNextPage: skip + data.mangas.length < data.total };
    },
    async getLatest(page): Promise<MangaPage> {
      const skip = (page - 1) * PAGE_SIZE;
      const data = await api<{ chapters: { manga: MangaDto }[]; total: number }>(
        `/latest?skip=${skip}&take=${PAGE_SIZE}`,
      );
      // The API lists chapters: one entry per series.
      const seen = new Set<string>();
      const items = data.chapters
        .map((c) => c.manga)
        .filter((m) => !seen.has(m.slug) && !!seen.add(m.slug))
        .map(toSummary);
      return { items, hasNextPage: skip + data.chapters.length < data.total };
    },
    async getFilters(): Promise<Filter[]> {
      const filters: Filter[] = [];
      try {
        const { genres } = await api<{ genres: string[] }>(`${BASE_URL}/api/genres`);
        if (genres.length)
          filters.push({
            type: 'group',
            id: 'genres',
            label: 'Manga Türü',
            filters: genres.map((g): Filter => ({ type: 'checkbox', id: `genre.${g}`, label: g })),
          });
      } catch {
        // Without the genre list the other filters still work.
      }
      filters.push(
        { type: 'checkbox', id: 'adult', label: 'Yetişkinlere yönelik içerik' },
        { type: 'checkbox', id: 'finished', label: 'Tamamlanmış seri' },
        { type: 'text', id: 'score', label: 'Minimum Puan (0-100)' },
        { type: 'text', id: 'year', label: 'Minimum Çıkış Yılı (Örn: 2020)' },
      );
      return filters;
    },
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const genres = Object.entries(filters)
        .filter(([id, value]) => id.startsWith('genre.') && value === true)
        .map(([id]) => id.slice('genre.'.length))
        .join(',');
      const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string).trim() : '');
      const params = [
        `page=${page}`,
        `q=${encodeURIComponent(query)}`,
        ...(genres ? [`genres=${encodeURIComponent(genres)}`] : []),
        ...(filters.adult === true ? ['isAdult=true'] : []),
        ...(filters.finished === true ? ['isFinished=true'] : []),
        ...(text('score') ? [`meanScore=${encodeURIComponent(text('score'))}`] : []),
        ...(text('year') ? [`releaseDate=${encodeURIComponent(text('year'))}`] : []),
      ];
      const data = await api<{ hits: { document: MangaDto }[]; estimatedTotalHits: number }>(
        `/search?${params.join('&')}`,
      );
      return {
        items: data.hits.map((h) => toSummary(h.document)),
        hasNextPage: page * SEARCH_PAGE_SIZE < data.estimatedTotalHits,
      };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const dto = await api<MangaDto & { status: string; description?: string | null; genres: { name: string }[] }>(
        `/${slugOf(manga.url)}`,
      );
      const statuses: Record<string, MangaStatus> = {
        FINISHED: 'completed',
        RELEASING: 'ongoing',
        HIATUS: 'hiatus',
        CANCELLED: 'cancelled',
      };
      return {
        ...toSummary(dto),
        description: dto.description ?? undefined,
        genres: dto.genres.map((g) => g.name),
        status: statuses[dto.status] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const slug = slugOf(manga.url);
      const chapters: Chapter[] = [];
      let skip = 0;
      for (;;) {
        const data = await api<{ chapters: { chapter: number }[]; total: number }>(
          `/${slug}/chapters?skip=${skip}&take=${PAGE_SIZE}`,
        );
        for (const { chapter } of data.chapters) {
          chapters.push({ url: `/manga/${slug}/${chapter}`, name: `Bölüm ${chapter}`, number: chapter });
        }
        skip += data.chapters.length;
        if (data.chapters.length === 0 || skip >= data.total) break;
      }
      // The API lists them in ascending order.
      return chapters.reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [, , slug, number] = chapter.url.split('/');
      const data = await api<{ cdn: string; uploads: { fansubId: string; fileLength: number }[] }>(
        `/${slug}/${number}`,
      );
      const upload = data.uploads[0];
      if (!upload) return [];
      return Array.from({ length: upload.fileLength }, (_, i) => ({
        index: i,
        imageUrl: `${data.cdn}/manga/${slug}/${number}/${i + 1}-${upload.fansubId}.webp`,
      }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/manga\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/manga/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
