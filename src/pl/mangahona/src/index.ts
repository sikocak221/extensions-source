import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, parseDate } from './common/utils';

const BASE_URL = 'https://mangahona.pl';
const API_URL = 'https://api.mangahona.pl/v1';
const CDN_URL = 'https://cdn.mangahona.pl';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface MangaDto {
  ID: number;
  NAME: string;
  DESCRIPTION?: string | null;
  AUTHOR?: string | null;
  cover_image?: string | null;
  STATUS?: string | null;
  GENERE?: string | null;
  TAG?: string | null;
}

interface ChapterDto {
  CHAPTER_NAME: string;
  CHAPTER_INDEX: string | number;
  DATE?: string | null;
}

interface CategoryDto {
  ID: number;
  NAME: string;
}

interface CategoriesDto {
  generes: CategoryDto[];
  tags: CategoryDto[];
}

async function api<T>(path: string): Promise<T> {
  const response = await http.get(`${API_URL}${path}`, { headers });
  return JSON.parse(response.body) as T;
}

const mangaId = (manga: MangaSummary) => manga.url.replace(/^\/manga\//, '');

const thumbnail = (cover?: string | null) =>
  cover ? `${CDN_URL}/images.php?url=${encodeURIComponent(cover)}&w=1900` : undefined;

const toSummary = (dto: MangaDto): MangaSummary => ({
  url: `/manga/${dto.ID}`,
  title: dto.NAME,
  thumbnailUrl: thumbnail(dto.cover_image),
});

async function listManga(query = ''): Promise<MangaPage> {
  const all = await api<MangaDto[]>('/manga');
  const needle = query.trim().toLowerCase();
  const matches = needle ? all.filter((m) => m.NAME.toLowerCase().includes(needle)) : all;
  return { items: matches.map(toSummary), hasNextPage: false };
}

let categoriesCache: CategoriesDto | null = null;

async function categories(): Promise<CategoriesDto | null> {
  if (categoriesCache) return categoriesCache;
  try {
    return (categoriesCache = await api<CategoriesDto>('/categories'));
  } catch {
    return null;
  }
}

async function genres(genreIds?: string | null, tagIds?: string | null): Promise<string[] | undefined> {
  const cats = await categories();
  if (!cats) return undefined;
  const names = (ids: string | null | undefined, list: CategoryDto[]) =>
    (ids?.split(';') ?? []).flatMap((id) => {
      const found = list.find((c) => String(c.ID) === id.trim());
      return found ? [found.NAME] : [];
    });
  const combined = [...names(genreIds, cats.generes), ...names(tagIds, cats.tags)];
  return combined.length ? combined : undefined;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: () => listManga(),
    search: (query) => listManga(query),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const dto = await api<MangaDto>(`/manga/${mangaId(manga)}`);
      const status = (dto.STATUS ?? '').toLowerCase();
      return {
        url: manga.url,
        title: dto.NAME,
        description: dto.DESCRIPTION?.replace(/\r\n/g, '\n').trim() || undefined,
        author: dto.AUTHOR?.trim() || undefined,
        thumbnailUrl: thumbnail(dto.cover_image),
        genres: await genres(dto.GENERE, dto.TAG),
        status: status === 'completed' ? 'completed' : status === 'ongoing' ? 'ongoing' : 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const chapters = await api<ChapterDto[]>(`/chapters/${mangaId(manga)}`);
      return chapters
        .map((dto) => ({
          url: `/czytaj/${mangaId(manga)}/${dto.CHAPTER_INDEX}`,
          name: dto.CHAPTER_NAME,
          uploadedAt: parseDate(dto.DATE, 'yyyy-M-d HH:mm:ss'),
        }))
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [mangaId, chapterIndex] = chapter.url.replace(/^\/czytaj\//, '').split('/');
      const { data } = await api<{ data: string }>(`/chapterData/${mangaId}/${chapterIndex}`);
      const pages = JSON.parse(data) as Record<string, { src: string }>;
      return Object.entries(pages)
        .sort(([a], [b]) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0))
        .map(([, page], index) => ({ index, imageUrl: page.src }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/(?:manga|czytaj)\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/manga/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
