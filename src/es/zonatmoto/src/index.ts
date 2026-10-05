import {
  type Chapter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, parseDate } from './common/utils';
import { GENRES, GROUPS } from './filters';

const BASE_URL = 'https://zonatmo.to';
const API_URL = `${BASE_URL}/wp-api/api`;
const CDN_URL = 'https://cdn.zonatmo.to';
const UPLOADS_URL = `${BASE_URL}/wp-content/uploads`;
const CHAPTERS_PER_PAGE = 50;
const NOVEL_TYPE = 214;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface MangaDto {
  slug: string;
  title: string;
  overview?: string | null;
  cover?: string | null;
  author?: { name: string }[] | null;
  status?: number[] | null;
  genres?: number[] | null;
  types?: number[] | null;
}

interface ChapterItem {
  id: number;
  chapter_number: string;
  title: string;
  slug: string;
  release_date?: string | null;
}

async function api<T>(path: string): Promise<T> {
  return (await http.get<T>(API_URL + path, { headers, responseType: 'json' })).body;
}

function thumbnail(cover: string | null | undefined): string | undefined {
  const path = cover?.trim();
  if (!path) return undefined;
  return path.startsWith('http') ? path : `${UPLOADS_URL}/${path.replace(/^\//, '')}`;
}

function summaries(list: MangaDto[] | undefined): MangaSummary[] {
  return (
    (list ?? [])
      // Novels (type 214) have text-image chapters; leave them out.
      .filter((m) => m.slug.trim() && m.title.trim() && !m.types?.includes(NOVEL_TYPE))
      .map((m) => ({ url: `/manga/${m.slug.trim()}`, title: m.title.trim(), thumbnailUrl: thumbnail(m.cover) }))
  );
}

function statusOf(status: number[] | null | undefined): MangaStatus {
  if (!status) return 'unknown';
  if (status.includes(12)) return 'ongoing';
  if (status.includes(19)) return 'completed';
  if (status.includes(174)) return 'hiatus';
  if (status.includes(198)) return 'cancelled';
  return 'unknown';
}

const slugOf = (url: string) => url.split('/')[2] ?? '';

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const result = await api<{ data?: { items: MangaDto[] } }>('/tops/views/month?postType=any&postsPerPage=50');
      return { items: summaries(result.data?.items), hasNextPage: false };
    },
    getFilters: () => GROUPS,
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params = [`page=${page}`];
      if (query.trim()) params.push(`search=${encodeURIComponent(query.trim())}`);
      for (const [id, value] of Object.entries(filters)) {
        const [group, key] = id.split('.');
        if (value === true && key && ['genres', 'type', 'status'].includes(group!))
          params.push(`${group}%5B%5D=${key}`);
      }
      const result = await api<{ data?: { items: MangaDto[]; pagination?: { has_next: boolean } } }>(
        `/listing/manga?${params.join('&')}`,
      );
      return { items: summaries(result.data?.items), hasNextPage: result.data?.pagination?.has_next ?? false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const dto = (await api<{ data?: MangaDto }>(`/single/manga/${slugOf(manga.url)}`)).data;
      if (!dto) throw new Error('Unable to parse manga details');
      const authors = [...new Set((dto.author ?? []).map((a) => a.name.trim()).filter(Boolean))];
      return {
        url: manga.url,
        title: dto.title.trim() || manga.title,
        thumbnailUrl: thumbnail(dto.cover) ?? manga.thumbnailUrl,
        description: dto.overview?.trim() || undefined,
        genres: (dto.genres ?? [])
          .map((id) => GENRES.find(([, value]) => value === String(id))?.[0])
          .filter((g): g is string => Boolean(g)),
        author: authors.join(', ') || undefined,
        status: statusOf(dto.status),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const slug = slugOf(manga.url);
      const items: ChapterItem[] = [];
      for (let page = 1, total = 1; page <= total; page++) {
        const result = await api<{ data?: { items: ChapterItem[]; pagination?: { total_pages: number } } }>(
          `/single/manga/${slug}/chapters?page=${page}&postsPerPage=${CHAPTERS_PER_PAGE}&order=asc`,
        );
        items.push(...(result.data?.items ?? []));
        total = result.data?.pagination?.total_pages ?? 1;
      }
      const seen = new Set<number>();
      return items
        .filter((c) => !seen.has(c.id) && Boolean(seen.add(c.id)))
        .sort((a, b) => (Number(b.chapter_number) || -1) - (Number(a.chapter_number) || -1))
        .map((c) => ({
          url: `/manga/${slug}/${c.slug}`,
          name: `#${c.chapter_number}${c.title.trim() ? ` - ${c.title.trim()}` : ''}`,
          number: Number(c.chapter_number) || undefined,
          uploadedAt: parseDate(c.release_date, 'yyyy-MM-dd HH:mm:ss'),
        }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [, , mangaSlug, chapterSlug] = chapter.url.split('/');
      const result = await api<{
        data?: { chapter?: { jit: string; images: { image_url: string; page_number: number }[] } };
      }>(`/single/manga/${mangaSlug}/${chapterSlug}`);
      const data = result.data?.chapter;
      if (!data) throw new Error('Unable to parse chapter pages');
      return [...data.images]
        .sort((a, b) => a.page_number - b.page_number)
        .map((image, index) => ({
          index,
          imageUrl: `${CDN_URL}/manga/${data.jit}/${encodeURIComponent(image.image_url)}`,
        }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/manga\/([^/?#]+)\/?(?:[?#]|$)/i.exec(url.trim());
      return match && match[1]!.toLowerCase().replace(/^www\./, '') === hostOf(BASE_URL)
        ? { url: `/manga/${match[2]}`, title: '' }
        : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
