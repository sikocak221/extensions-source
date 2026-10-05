import {
  type Chapter,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, parseDate } from './common/utils';

const BASE_URL = 'https://www.creative-comic.tw';
const API_URL = 'https://api.creative-comic.tw';
// Without a logged-in session (the site keeps its token in localStorage) the reader uses a fixed passphrase:
// key = SHA-512("freeforccc2020reading")[0..32), iv = key[15..31). Only free chapters can be read this way.
const PAGE_KEY = '8134f84a8dbde288125cf50029c1992cb7e197b42290404a1efe7ab0dfe16aee';
const PAGE_IV = '2cb7e197b42290404a1efe7ab0dfe16a';
const IMAGE_PATH = 'https://storage.googleapis.com/ccc-www/fs/chapter_content/encrypt/';

const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, device: 'web_desktop', uuid: 'null' };

const idOf = (url: string) => url.replace(/^\/+/, '');
const hex = (text: string): number[] => (text.match(/../g) ?? []).map((h) => Number.parseInt(h, 16));

async function api<T>(path: string): Promise<T> {
  return (await http.get<T>(`${API_URL}${path}`, { headers, responseType: 'json' })).body;
}

interface MangaDto {
  id: number;
  name: string;
  image1: string;
}

async function mangaList(path: string, page: number, rows: number): Promise<MangaPage> {
  const { data } = await api<{ data: { total: number; data: MangaDto[] } }>(path);
  return {
    items: data.data.map((m) => ({ url: `/${m.id}`, title: m.name, thumbnailUrl: m.image1 })),
    hasNextPage: data.total > page * rows,
  };
}

/** "<key>:<iv>" (hex) of a page image, decrypted with the reader's key. */
async function imageKey(id: string): Promise<string> {
  const { data } = await api<{ data: { key: string } }>(`/book/chapter/image/${id}`);
  const plain = crypto.aesDecrypt(base64.decodeBytes(data.key), hex(PAGE_KEY), { mode: 'cbc', iv: hex(PAGE_IV) });
  return utf8.decode([...plain]);
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => mangaList(`/book?page=${page}&rows_per_page=24&sort_by=like_count&class=2`, page, 24),
    getLatest: (page) => mangaList(`/book?page=${page}&rows_per_page=24&sort_by=updated_at&class=2`, page, 24),
    search: (query, page) =>
      mangaList(
        `/book?page=${page}&rows_per_page=12&keyword=${encodeURIComponent(query)}&category=all&sort_by=updated_at&class=2`,
        page,
        12,
      ),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { data } = await api<{
        data: {
          name: string;
          description: string;
          image1: string;
          author: { name: string }[];
          type: { name: string };
          tags: { name: string }[];
          completed: number;
        };
      }>(`/book/${idOf(manga.url)}/info`);
      return {
        url: manga.url,
        title: data.name,
        thumbnailUrl: data.image1,
        author: data.author.map((a) => a.name).join(', '),
        description: data.description,
        genres: [data.type.name, ...data.tags.map((t) => t.name)],
        status: data.completed === 1 ? 'completed' : 'ongoing',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { data } = await api<{
        data: {
          chapters: {
            id: number;
            name: string;
            vol_name: string;
            is_free: number;
            is_buy: number;
            is_rent: number;
            sales_plan: number;
            online_at: string;
          }[];
        };
      }>(`/book/${idOf(manga.url)}/chapter`);
      return data.chapters
        .map((c) => {
          const readable = c.is_free === 1 || c.is_buy === 1 || c.is_rent === 1 || c.sales_plan === 0;
          return {
            url: `/${c.id}`,
            name: `${readable ? '' : '🔒'}${c.vol_name} ${c.name}`,
            uploadedAt: parseDate(c.online_at, 'yyyy-MM-dd HH:mm:ss'),
          };
        })
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { data } = await api<{ data: { chapter: { proportion: { id: number }[] } } }>(
        `/book/chapter/${idOf(chapter.url)}`,
      );
      return data.chapter.proportion.map((p, index) => ({ index, url: `${API_URL}/book/chapter/image/${p.id}` }));
    },
    // The image key comes with the page's api url; the image is requested with it as the url fragment.
    async getImageUrl(page: Page): Promise<string> {
      const id = (page.url ?? '').split('/').pop();
      return `${IMAGE_PATH}${id}/2#${await imageKey(id ?? '')}`;
    },
    // The image is a data url ("data:image/jpeg;base64,...") encrypted with that key and iv ("<key>:<iv>").
    async transformImage(page: Page, bytes: Uint8Array): Promise<ImageTransform> {
      const id = (page.url ?? '').split('/').pop() ?? '';
      const keyAndIv = (page.imageUrl ?? '').split('#')[1] ?? (await imageKey(id));
      const [key, iv] = keyAndIv.split(':') as [string, string];
      const plain = utf8.decode([...crypto.aesDecrypt(bytes, hex(key), { mode: 'cbc', iv: hex(iv) })]);
      return { bytes: base64.decodeBytes(plain.slice(plain.indexOf('base64,') + 7)) };
    },
    imageHeaders: () => headers,
    getWebUrl: (item) =>
      'name' in item
        ? `${BASE_URL}/zh/reader_comic/${idOf(item.url)}`
        : `${BASE_URL}/zh/book/${idOf(item.url)}/content`,
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)\/(?:zh\/)?book\/(\d+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase().replace(/^www\./, '') !== 'creative-comic.tw') return null;
      return { url: `/${match[2]}`, title: '' };
    },
  }),
});
