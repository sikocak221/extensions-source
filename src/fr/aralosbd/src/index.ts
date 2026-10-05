import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, decodeEntities, parseDate } from './common/utils';

const BASE_URL = 'https://aralosbd.fr';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface SearchManga {
  icon: string;
  title: string;
  id: number;
}

interface ApiChapter {
  chapter_number: string;
  chapter_title: string;
  chapter_translator?: string | null;
  chapter_id: number;
  chapter_released: number;
  chapter_release_time?: string | null;
}

const get = async <T>(url: string): Promise<T> => JSON.parse((await http.get(url, { headers })).body) as T;
const idOf = (url: string) => /[?&]id=(\d+)/.exec(url)?.[1] ?? '';

/** The descriptions are Markdown-ish: links, bold, italics and emoji codes are flattened. */
function cleanString(text: string): string {
  const before = decodeEntities(text).split('---')[0] ?? '';
  return before
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$2')
    .replace(/\*+\s*([^*]*)\s*\*+/g, '$1')
    .replace(/_+\s*([^_]*)\s*_+/g, '$1')
    .replace(/:+[a-zA-Z]+:/g, '')
    .trim();
}

async function searchMangas(query: string, page: number): Promise<MangaPage> {
  const result = await get<{ page_count: number; mangas: SearchManga[] }>(`${BASE_URL}/manga/search?s=${query}`);
  return {
    items: result.mangas.map((m) => ({
      url: `/manga/display?id=${m.id}`,
      title: m.title,
      thumbnailUrl: `${BASE_URL}/${m.icon}`,
    })),
    hasNextPage: page < result.page_count,
  };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    // Sorted by total views (title + chapters)
    getPopular: (page) => searchMangas(`sort:allviews;limit:24;-id:3;page:${page - 1};order:desc`, page),
    // A new title always has a greater id; "last updated" is not in the API.
    getLatest: (page) => searchMangas(`sort:id;limit:24;-id:3;page:${page - 1};order:desc`, page),
    search: (query, page) => searchMangas(`page:${page - 1};sort:id;order:desc;text:${query}`, page),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const m = await get<{
        main_title: string;
        fulldescription?: string | null;
        description: string;
        authors?: { name: string }[] | null;
        tags?: { tag: string }[] | null;
        icon: string;
      }>(`${BASE_URL}/manga/api?get=manga&id=${idOf(manga.url)}`);
      return {
        url: manga.url,
        title: m.main_title,
        author: m.authors?.map((a) => a.name).join(', ') || undefined,
        description: cleanString(`${m.description}\n\n${m.fulldescription ?? ''}`),
        genres: m.tags?.map((t) => t.tag),
        thumbnailUrl: `${BASE_URL}/${m.icon}`,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const list = await get<ApiChapter[]>(`${BASE_URL}/manga/api?get=chapters&manga=${idOf(manga.url)}`);
      return list
        .filter((c) => c.chapter_released === 1)
        .map((c) => ({
          url: `/manga/chapter?id=${c.chapter_id}`,
          name: `${c.chapter_number} - ${c.chapter_title}`,
          // chapter_number is a string and it can be 2.5.1 for example
          scanlator: c.chapter_translator || undefined,
          uploadedAt: parseDate(c.chapter_release_time, 'yyyy-MM-dd HH:mm:ss'),
        }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const data = await get<{ links: string[] }>(`${BASE_URL}/manga/api?get=pages&chapter=${idOf(chapter.url)}`);
      return data.links.map((link, index) => ({ index, imageUrl: `${BASE_URL}/${link}` }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
    resolveUrl(url): MangaSummary | null {
      const id = /^https?:\/\/aralosbd\.fr\/manga\/display\?(?:.*&)?id=(\d+)/i.exec(url)?.[1];
      return id ? { url: `/manga/display?id=${id}`, title: '' } : null;
    },
  }),
});
