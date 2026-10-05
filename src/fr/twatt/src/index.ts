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

const BASE_URL = 'https://twatt.fr';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface Project {
  id: string;
  title: string;
  genre?: string | null;
  type?: string | null;
  status?: string | null;
  description?: string | null;
  coverImage?: string | null;
  readCount?: number | null;
}

interface ChapterEntry {
  id: string;
  number: number;
  title?: string | null;
  releasedAt?: string | null;
}

const STATUS: Record<string, MangaStatus> = { ongoing: 'ongoing', completed: 'completed' };

// Some covers are inline data: images, which are passed on as they are.
const resolvePath = (path: string) => (/^(?:https?:|data:)/.test(path) ? path : `${BASE_URL}${path}`);

const get = async <T>(path: string): Promise<T> =>
  JSON.parse((await http.get(`${BASE_URL}${path}`, { headers })).body) as T;

const toSummary = (p: Project): MangaSummary => ({
  url: `/serie/${p.id}`,
  title: p.title,
  thumbnailUrl: p.coverImage ? resolvePath(p.coverImage) : undefined,
});

const projects = async () => (await get<{ projects: Project[] }>('/api/projects')).projects;

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      // The API has no ordering: the most read series come first.
      const popular = (await projects()).sort((a, b) => (b.readCount ?? 0) - (a.readCount ?? 0));
      return { items: popular.map(toSummary), hasNextPage: false };
    },
    async search(query): Promise<MangaPage> {
      const needle = query.toLowerCase();
      const items = (await projects()).filter((p) => p.title.toLowerCase().includes(needle)).map(toSummary);
      return { items, hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const data = await get<{ project: Project; mainTeam?: { name: string } | null }>(
        `/api/series/${manga.url.substring(manga.url.lastIndexOf('/') + 1)}`,
      );
      const p = data.project;
      return {
        ...toSummary(p),
        description: p.description ?? undefined,
        genres: [p.genre, p.type].filter((g): g is string => !!g),
        author: data.mainTeam?.name,
        status: STATUS[p.status ?? ''] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const data = await get<{ chapters: ChapterEntry[] }>(
        `/api/series/${manga.url.substring(manga.url.lastIndexOf('/') + 1)}`,
      );
      return data.chapters.map((c) => ({
        url: `/chapitre/${c.id}`,
        name: c.title?.trim() ? c.title : `Chapitre ${c.number}`,
        number: c.number,
        uploadedAt: Date.parse(c.releasedAt ?? '') || undefined,
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const data = await get<{ chapter: { images: string[] } }>(
        `/api/chapters/${chapter.url.substring(chapter.url.lastIndexOf('/') + 1)}`,
      );
      return data.chapter.images.map((path, index) => ({ index, imageUrl: resolvePath(path) }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
    resolveUrl(url): MangaSummary | null {
      const match = /^https?:\/\/twatt\.fr\/serie\/([^/?#]+)/i.exec(url);
      return match ? { url: `/serie/${match[1]}`, title: '' } : null;
    },
  }),
});
