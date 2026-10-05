import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf } from './common/utils';

const BASE_URL = 'https://olympusxyz.com';
const API_URL = BASE_URL.replace('https://', 'https://panel.');
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const SEARCH_PAGE_SIZE = 20;

// Series slugs are obfuscated and change over time, so manga are identified by id (`/comic/<id>`,
// chapters `/comic/<id>/<chapter id>`) and the current slug is looked up from the series list.

interface MangaDto {
  id: number;
  name: string;
  slug: string;
  cover?: string | null;
  type?: string | null;
  summary?: string | null;
  status?: { id: number } | null;
  genres?: { id: number; name: string }[] | null;
}

interface Paged<T> {
  data: T[];
  current_page: number;
  last_page: number;
}

const slugs = new Map<number, string>();
let seriesList: MangaDto[] | undefined;

async function get<T>(url: string): Promise<T> {
  return (await http.get<T>(url, { headers, responseType: 'json' })).body;
}

function remember(mangas: MangaDto[]): void {
  for (const m of mangas) slugs.set(m.id, m.slug);
}

async function comics(): Promise<MangaDto[]> {
  if (!seriesList) {
    seriesList = (await get<{ data: MangaDto[] }>(`${BASE_URL}/api/series/list`)).data.filter(
      (m) => m.type === 'comic',
    );
    remember(seriesList);
  }
  return seriesList;
}

async function slugOf(id: number): Promise<string> {
  const known = slugs.get(id);
  if (known) return known;
  const manga = (await comics()).find((m) => m.id === id);
  if (!manga) throw new Error('Serie no encontrada');
  return manga.slug;
}

const idOf = (url: string) => Number(/^\/comic\/(\d+)/.exec(url)?.[1]);

function summary(m: MangaDto): MangaSummary {
  return { url: `/comic/${m.id}`, title: m.name, thumbnailUrl: m.cover || undefined };
}

async function paged(url: string): Promise<MangaPage> {
  const result = await get<Paged<MangaDto>>(url);
  const items = result.data.filter((m) => m.type === 'comic');
  remember(items);
  return { items: items.map(summary), hasNextPage: result.current_page < result.last_page };
}

const STATUS: Record<number, MangaStatus> = { 1: 'ongoing', 3: 'hiatus', 4: 'completed', 5: 'cancelled' };

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => paged(`${BASE_URL}/api/rankings?page=${page}&period=total_ranking`),
    getLatest: (page) => paged(`${BASE_URL}/api/new-chapters?page=${page}`),
    async search(query: string, page: number): Promise<MangaPage> {
      const needle = query.trim().toLowerCase();
      const matches = (await comics()).filter((m) => m.name.toLowerCase().includes(needle));
      return {
        items: matches.slice((page - 1) * SEARCH_PAGE_SIZE, page * SEARCH_PAGE_SIZE).map(summary),
        hasNextPage: page * SEARCH_PAGE_SIZE < matches.length,
      };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const slug = await slugOf(idOf(manga.url));
      const dto = (await get<{ data: MangaDto }>(`${BASE_URL}/api/series/${slug}?type=comic`)).data;
      return {
        ...summary(dto),
        description: dto.summary || undefined,
        genres: dto.genres?.map((g) => g.name.trim()) ?? [],
        status: (dto.status && STATUS[dto.status.id]) || 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const id = idOf(manga.url);
      const slug = await slugOf(id);
      const chapters: Chapter[] = [];
      for (let page = 1; ; page++) {
        const result = await get<{
          data: { id: number; name: string; published_at?: string }[];
          meta: { total: number };
        }>(`${API_URL}/api/series/${slug}/chapters?page=${page}&direction=desc&type=comic`);
        for (const c of result.data) {
          const time = c.published_at ? Date.parse(c.published_at) : Number.NaN;
          chapters.push({
            url: `/comic/${id}/${c.id}`,
            name: `Capitulo ${c.name}`,
            number: Number(c.name) || undefined,
            uploadedAt: Number.isNaN(time) ? undefined : time,
          });
        }
        if (!result.data.length || chapters.length >= result.meta.total) break;
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [, mangaId, chapterId] = /^\/comic\/(\d+)\/(\d+)/.exec(chapter.url) ?? [];
      const slug = await slugOf(Number(mangaId));
      const result = await get<{ chapter: { pages: string[] } }>(`${BASE_URL}/api/capitulo/comic-${slug}/${chapterId}`);
      return result.chapter.pages.map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/series\/comic-([^/?#]+)/i.exec(url.trim());
      if (!match || match[1]!.toLowerCase() !== hostOf(BASE_URL)) return null;
      const id = [...slugs].find(([, slug]) => slug === match[2])?.[0];
      return id ? { url: `/comic/${id}`, title: '' } : null;
    },
    getWebUrl(item): string {
      const [, mangaId, chapterId] = /^\/comic\/(\d+)(?:\/(\d+))?/.exec(item.url) ?? [];
      const slug = slugs.get(Number(mangaId));
      if (!slug) return BASE_URL;
      return chapterId ? `${BASE_URL}/capitulo/${chapterId}/comic-${slug}` : `${BASE_URL}/series/comic-${slug}`;
    },
  }),
});
