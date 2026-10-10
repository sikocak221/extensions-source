import {
  type Chapter,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, htmlToText } from './common/utils';

const BASE_URL = 'https://sp.manga.nicovideo.jp';
const API = 'https://api.nicomanga.jp/api/v1/app/manga';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const IMAGE_REGEX = /^https:\/\/drm\.cdn\.nicomanga\.jp\/image\/([a-f0-9]+)_\d+\/\d+p(\.[a-z]+)?(\?\d+)?/;

interface MangaDto {
  id: number;
  meta: { title: string; display_author_name: string; description: string; serial_status: string; square_image_url?: string | null };
}
interface ApiResponse<T> {
  data: { result: T | T[]; extra?: { has_next?: boolean } };
}
const results = <T>(r: ApiResponse<T>): T[] => (Array.isArray(r.data.result) ? r.data.result : [r.data.result]);

const get = async <T>(url: string): Promise<T> => (await http.get<T>(url, { headers, responseType: 'json' })).body;

const summary = (m: MangaDto): MangaSummary => ({
  url: `/comic/${m.id}`,
  title: m.meta.title,
  thumbnailUrl: m.meta.square_image_url ?? undefined,
});
const idOf = (url: string) => url.replace(/^\/comic\//, '');

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(page: number): Promise<MangaPage> {
      const list = await get<{ id: number; title: string; author: string; thumbnail_url: string }[]>(
        `${BASE_URL}/manga/ajax/ranking?span=total&category=all&page=${page}`,
      );
      // The thumbnail only shows a glimpse of the latest chapter; details have a better one.
      return {
        items: list.map((m) => ({ url: `/comic/${m.id}`, title: m.title, thumbnailUrl: m.thumbnail_url })),
        hasNextPage: page < 5,
      };
    },
    async search(query: string, page: number): Promise<MangaPage> {
      const r = await get<ApiResponse<MangaDto>>(
        `${API}/contents?mode=keyword&sort=score&q=${encodeURIComponent(query)}&limit=20&offset=${(page - 1) * 20}`,
      );
      return { items: results(r).map(summary), hasNextPage: r.data.extra?.has_next === true };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const m = results(await get<ApiResponse<MangaDto>>(`${API}/contents/${idOf(manga.url)}`))[0]!;
      const status: MangaStatus = m.meta.serial_status === 'serial' ? 'ongoing' : m.meta.serial_status === 'concluded' ? 'completed' : 'unknown';
      return {
        ...summary(m),
        description: htmlToText(m.meta.description),
        author: m.meta.display_author_name,
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const r = await get<
        ApiResponse<{
          id: number;
          meta: { title: string; number: number; created_at: number };
          own_status: { sell_status: string };
        }>
      >(`${API}/contents/${idOf(manga.url)}/episodes`);
      return results(r)
        .filter((c) => c.own_status.sell_status !== 'publication_finished')
        .map((c) => {
          const prefix = c.own_status.sell_status === 'selling' ? '\u{1F4B4} ' : c.own_status.sell_status === 'pre_selling' ? '⏳\u{1F4B4} ' : '';
          return { url: String(c.id), name: prefix + c.meta.title, number: c.meta.number, uploadedAt: c.meta.created_at * 1000 };
        })
        .sort((a, b) => b.number - a.number);
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.request<ApiResponse<{ meta: { source_url: string } }>>({
        url: `${API}/episodes/${chapter.url}/frames?enable_webp=true`,
        headers,
        responseType: 'json',
      });
      if (response.status === 403) throw new Error('公式アプリで購入してください / まず、WebViewでログインしてください');
      if (response.status !== 200) throw new Error(`HTTP error ${response.status}`);
      return results(response.body).map((frame, index) => ({ index, imageUrl: frame.meta.source_url }));
    },
    imageHeaders: () => ({ ...headers, 'sec-fetch-dest': 'image', 'sec-fetch-mode': 'no-cors', 'sec-fetch-site': 'cross-site' }),
    /** Paid images (drm.cdn) are XOR-ed with the 8 bytes of the key found in their url. */
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      const key = IMAGE_REGEX.exec(page.imageUrl ?? '')?.[1];
      if (!key) return {};
      const keySet = Array.from({ length: 8 }, (_, i) => Number.parseInt(key.slice(2 * i, 2 * i + 2), 16));
      const out = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) out[i] = bytes[i]! ^ keySet[i % 8]!;
      return { bytes: out };
    },
    resolveUrl(url: string): MangaSummary | null {
      const id = /\/comic\/(\d+)/.exec(url)?.[1];
      return hostOf(url).endsWith('nicovideo.jp') && id ? { url: `/comic/${id}`, title: '' } : null;
    },
    getWebUrl: (item) => ('name' in item ? `${BASE_URL}/watch/mg${item.url}` : BASE_URL + item.url),
  }),
});
