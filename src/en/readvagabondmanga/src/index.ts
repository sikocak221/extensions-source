import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://readbagabondo.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface MangaDto {
  id: number;
  title: string;
  author: string;
  artist: string;
  description: string;
  status?: 'ongoing' | 'completed' | 'hiatus';
  cover: string;
}

interface ChapterDto {
  number: number;
  title: string;
  volume?: number | null;
  mangaId: number;
  releaseDate: string;
  pageCount: number;
}

const api = async <T>(path: string) =>
  (await http.get<T>(`${BASE_URL}/api/mihon${path}`, { headers, responseType: 'json' })).body;
const toPage = (list: MangaDto[]): MangaPage => ({
  items: list.map((m) => ({ url: `/#${m.id}`, title: m.title, thumbnailUrl: m.cover })),
  hasNextPage: false,
});

// Manga urls are "/#<id>", chapter urls "/volume-<v>/chapter-<n>/#<manga id>".
export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async () => toPage(await api<MangaDto[]>('/mangas')),
    search: async (query, page) =>
      toPage(await api<MangaDto[]>(`/mangas?q=${encodeURIComponent(query.trim())}&page=${page}`)),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const m = await api<MangaDto>(`/mangas/${manga.url.split('#')[1]}`);
      return {
        url: manga.url,
        title: m.title,
        thumbnailUrl: m.cover,
        author: m.author,
        artist: m.artist,
        description: m.description,
        status: m.status ?? 'ongoing',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const chapters = await api<ChapterDto[]>(`/mangas/${manga.url.split('#')[1]}/chapters`);
      return chapters.map((c) => {
        const time = Date.parse(c.releaseDate);
        return {
          url: `/volume-${c.volume}/chapter-${c.number}/#${c.mangaId}`,
          name: c.title,
          number: c.number,
          scanlator: 'Read Vagabond Manga',
          uploadedAt: Number.isFinite(time) ? time : undefined,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const number = /chapter-(\d+)/.exec(chapter.url)?.[1];
      const c = await api<ChapterDto>(`/mangas/${chapter.url.split('#')[1]}/chapters/${number}`);
      return Array.from({ length: c.pageCount }, (_, i) => ({
        index: i,
        imageUrl: `https://pub.moleve.net/chapter-${c.number}/page-${i + 1}.png`,
      }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => (item.url.startsWith('/volume-') ? `${BASE_URL}${item.url.split('#')[0]}` : BASE_URL),
  }),
});
