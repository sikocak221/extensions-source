import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://leslie-victims.pages.dev';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface Entry {
  id: string;
  title: string;
  cover: string;
  chapters: string[];
  chapter_roots?: Record<string, { url: string; mode: string; data: unknown }>;
}

// Manga urls are "/?series=<id>", chapter urls "/?series=<id>&ch=<chapter>".
const library = async () => (await http.get<Entry[]>(`${BASE_URL}/manga.json`, { headers, responseType: 'json' })).body;
const param = (url: string, name: string) =>
  decodeURIComponent(new RegExp(`[?&]${name}=([^&#]*)`).exec(url)?.[1] ?? '');
const summary = (e: Entry): MangaDetails => ({
  url: `/?series=${encodeURIComponent(e.id)}`,
  title: e.title,
  thumbnailUrl: `${BASE_URL}/${e.cover}`,
  status: 'unknown',
});

async function entry(url: string): Promise<Entry> {
  const id = param(url, 'series');
  const found = (await library()).find((e) => e.id === id);
  if (!found) throw new Error(`Series not found: ${id}`);
  return found;
}

const toPage = (list: Entry[]): MangaPage => ({ items: list.map(summary), hasNextPage: false });

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async () => toPage(await library()),
    search: async (query) =>
      toPage((await library()).filter((e) => e.title.toLowerCase().includes(query.trim().toLowerCase()))),
    getMangaDetails: async (manga: MangaSummary) => summary(await entry(manga.url)),
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const e = await entry(manga.url);
      return [...e.chapters].reverse().map((ch) => ({
        url: `/?series=${encodeURIComponent(e.id)}&ch=${encodeURIComponent(ch)}`,
        name: `Chapter ${ch}`,
        number: Number(ch.split(' ')[0]) || undefined,
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const e = await entry(chapter.url);
      const ch = param(chapter.url, 'ch');
      const root = e.chapter_roots?.[ch];
      const pad = (n: number) => String(n).padStart(2, '0');
      if (root?.mode === 'list')
        return (root.data as string[]).map((file, index) => ({ index, imageUrl: `${root.url}/${file}` }));
      if (root?.mode === 'count')
        return Array.from({ length: Number(root.data) }, (_, i) => ({
          index: i,
          imageUrl: `${root.url}/${pad(i + 1)}.webp`,
        }));
      if (root) return [];
      // Without a manifest, pages are numbered files: probe until the first missing one.
      const pages: Page[] = [];
      for (let n = 1; n <= 150; n++) {
        const url = `${BASE_URL}/content/${encodeURIComponent(e.id)}/${encodeURIComponent(ch)}/${pad(n)}.webp`;
        const response = await http.request({ url, method: 'HEAD', headers });
        const type = Object.entries(response.headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? '';
        if (response.status >= 400 || !type.startsWith('image')) break;
        pages.push({ index: n - 1, imageUrl: url });
      }
      return pages;
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/leslie-victims\.pages\.dev\/?\?(?:.*&)?series=([^&#]+)/i.exec(url.trim());
      return match ? { url: `/?series=${match[1]}`, title: '' } : null;
    },
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
