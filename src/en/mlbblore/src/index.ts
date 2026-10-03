import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://play.mobilelegends.com';
const API_URL = 'https://api.mobilelegends.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const TYPE_COMIC = 3;
const PAGE_SIZE = 5;

interface Album {
  id: number;
  type?: number;
  title: string;
  hero_name?: string;
  thumb?: string;
  share_content?: string;
  comic_content?: string[];
}

const absolute = (url = '') => (url.startsWith('//') ? `https:${url}` : url);

async function list(page: number, sort: number): Promise<MangaPage> {
  const form = {
    type: String(TYPE_COMIC),
    sort: String(sort),
    page: String(page),
    page_size: String(PAGE_SIZE),
    lang: 'en',
    token: '',
  };
  const data =
    (await http.post<{ data?: Album[] }>(`${API_URL}/lore/album/list`, { form }, { headers, responseType: 'json' }))
      .body.data ?? [];
  return {
    items: data
      .filter((a) => a.type === TYPE_COMIC)
      .map((a) => ({ url: `/${a.id}`, title: a.title, thumbnailUrl: absolute(a.thumb) || undefined })),
    hasNextPage: data.length >= PAGE_SIZE,
  };
}

async function detail(url: string): Promise<Album | undefined> {
  const form = { id: url.replace(/^\//, ''), lang: 'en', token: '' };
  return (
    await http.post<{ data?: Album }>(`${API_URL}/lore/album/detail`, { form }, { headers, responseType: 'json' })
  ).body.data;
}

// Manga urls are "/<album id>"; each album is one chapter.
export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(page, 3),
    getLatest: (page) => list(page, 1),
    search: (_query, page) => list(page, 3),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const album = await detail(manga.url);
      if (!album) return { ...manga, status: 'unknown' };
      return {
        url: manga.url,
        title: album.title,
        author: album.hero_name?.trim() || undefined,
        thumbnailUrl: absolute(album.thumb) || manga.thumbnailUrl,
        description: album.share_content || undefined,
        status: 'completed',
      };
    },
    getChapters: async (manga: MangaSummary): Promise<Chapter[]> => [{ url: manga.url, name: 'Chapter 1', number: 1 }],
    getPages: async (chapter: Chapter): Promise<Page[]> =>
      ((await detail(chapter.url))?.comic_content ?? []).map((raw, index) => ({ index, imageUrl: absolute(raw) })),
    imageHeaders: () => headers,
    getWebUrl: () => BASE_URL,
  }),
});
