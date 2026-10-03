import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://xrabohrok.github.io/WarMap/#/';
const RAW = 'https://raw.githubusercontent.com';
const headers = { 'User-Agent': USER_AGENT };

interface Round {
  title: string;
  description: string;
  artist: string;
  author: string;
  cover: string;
  chapters: Record<string, { title: string; groups: { primary: string }; last_updated: number }>;
}

// Every round is a Cubari-style JSON file in the project's repository. Manga urls are its path on
// raw.githubusercontent.com, chapter urls Cubari API paths.
const round = async (url: string) => (await http.get<Round>(`${RAW}${url}`, { headers, responseType: 'json' })).body;

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const files = (
        await http.get<{ name: string; download_url: string }[]>(
          'https://api.github.com/repos/xrabohrok/WarMap/contents/tools',
          { headers, responseType: 'json' },
        )
      ).body;
      return {
        items: files
          .filter((f) => f.name.endsWith('.json'))
          .map((f) => ({ url: f.download_url.replace(RAW, ''), title: f.name })),
        hasNextPage: false,
      };
    },
    async search(query: string): Promise<MangaPage> {
      const all = await this.getPopular(1);
      return {
        items: all.items.filter((m) => m.title.toLowerCase().includes(query.trim().toLowerCase())),
        hasNextPage: false,
      };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const r = await round(manga.url);
      return {
        url: manga.url,
        title: r.title,
        description: r.description,
        thumbnailUrl: r.cover,
        author: r.author,
        artist: r.artist,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const r = await round(manga.url);
      return Object.entries(r.chapters)
        .map(([number, c]) => ({
          url: c.groups.primary,
          name: `${number} ${c.title}`,
          number: Number(number),
          uploadedAt: c.last_updated * 1000,
        }))
        .reverse();
    },
    // Chapters are Imgur albums behind Cubari's proxy ("/proxy/api/imgur/chapter/<album>/"); the proxy no longer
    // answers, so the album is read from Imgur's public API (the client id of imgur.com itself).
    async getPages(chapter: Chapter): Promise<Page[]> {
      const album = /imgur\/chapter\/([^/]+)/.exec(chapter.url)?.[1];
      if (!album) throw new Error('Unsupported chapter');
      const url = `https://api.imgur.com/post/v1/albums/${album}?client_id=546c25a59c58ad7&include=media`;
      const data = (await http.get<{ media: { url: string }[] }>(url, { headers, responseType: 'json' })).body;
      return data.media.map((m, index) => ({ index, imageUrl: m.url }));
    },
    getWebUrl: (item) => (item.url.startsWith('/read/') ? `https://cubari.moe${item.url}` : BASE_URL),
  }),
});
