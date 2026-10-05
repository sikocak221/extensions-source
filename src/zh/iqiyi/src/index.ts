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

const BASE_URL = 'https://bud.m.iqiyi.com';
const API_HOST = 'https://comic.iqiyi.com';
const API_KEY = '3sj8xof48xjf4tk9f4tk9ypgk9ypg5up';
// The device id is random in the app; the api accepts any 32 hex digits.
const QIYI_ID = '5f3a9c1e7b2d4860a1c3e5f7092b4d68';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

/**
 * The site's time, from a Date header (a request signed with the local clock could not be replayed),
 * advanced by whole minutes of local time so requests within the first minute are identical.
 */
let clock: { server: number; local: number } | undefined;

async function now(): Promise<number> {
  if (!clock) {
    const response = await http.request({ url: `${API_HOST}/`, headers });
    const date = Object.entries(response.headers).find(([name]) => name.toLowerCase() === 'date')?.[1];
    const server = date ? Date.parse(date) : Number.NaN;
    clock = { server: Number.isNaN(server) ? Date.now() : server, local: Date.now() };
  }
  return clock.server + Math.floor((Date.now() - clock.local) / 60_000) * 60_000;
}

async function api<T>(path: string, params: [string, string][]): Promise<T> {
  const query = [
    ...params,
    ['qiyiId', QIYI_ID],
    ['timeStamp', String(await now())],
    ['srcPlatform', '15'],
    ['appVer', '3.0.0'],
    ['agentVersion', 'h5'],
    ['agentType', '115'],
  ]
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join('&');
  // Same request signature as the H5 site: md5(path + query + key).
  const sign = crypto.md5(`${path}?${query}`.replace('?', '') + API_KEY);
  const response = await http.get<{ data: T }>(`${API_HOST}${path}?${query}`, {
    headers: { ...headers, md5: sign },
    responseType: 'json',
  });
  return response.body.data;
}

const comicId = (url: string) => /detail_(\d+)\.html/.exec(url)?.[1] ?? '';

interface Comic {
  id: number | string;
  title: string;
  image_url?: string | null;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const data = await api<{ popularityList: { comicId: number; title: string; pic?: string | null }[] }>(
        '/views/1.0/classify/popularity_list',
        [
          ['type', '1'],
          ['pageSize', '100'],
          ['pageNo', '1'],
        ],
      );
      return {
        items: data.popularityList.map((c) => ({
          url: `/detail_${c.comicId}.html`,
          title: c.title,
          thumbnailUrl: c.pic ?? undefined,
        })),
        hasNextPage: false,
      };
    },
    // The search API only ever returns a single page of results.
    async search(query, page): Promise<MangaPage> {
      const data = await api<{ docinfos: { albumDocInfo?: { comics?: Comic } }[] }>('/views/1.0/search', [
        ['key', query],
        ['page_num', String(page)],
      ]);
      const items = data.docinfos.flatMap((d): MangaSummary[] => {
        const comic = d.albumDocInfo?.comics;
        return comic
          ? [{ url: `/detail_${comic.id}.html`, title: comic.title, thumbnailUrl: comic.image_url ?? undefined }]
          : [];
      });
      return { items, hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const data = await api<{
        comicId: number;
        title: string;
        pic?: string | null;
        authorsName?: string | null;
        comicTags?: string[];
        brief?: string | null;
        serializeStatus?: number | null;
      }>('/views/1.0/comicDetail', [['comicId', comicId(manga.url)]]);
      const status: MangaStatus =
        data.serializeStatus === 1 ? 'ongoing' : data.serializeStatus === 2 ? 'completed' : 'unknown';
      return {
        url: `/detail_${data.comicId}.html`,
        title: data.title,
        thumbnailUrl: data.pic ?? manga.thumbnailUrl,
        author: data.authorsName ?? undefined,
        artist: data.authorsName ?? undefined,
        genres: (data.comicTags ?? []).filter((t) => t.trim()),
        description: data.brief ?? undefined,
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const data = await api<{
        episodes?: {
          comicId: number;
          episodeId: number;
          episodeTitle: string;
          episodeOrder: number;
          firstOnlineTime: number;
        }[];
      }>('/views/1.0/comicDetail', [['comicId', comicId(manga.url)]]);
      return (data.episodes ?? [])
        .map((e) => ({
          url: `/reader/${e.comicId}_${e.episodeId}.html`,
          name: `${e.episodeOrder} ${e.episodeTitle}`,
          uploadedAt: e.firstOnlineTime,
        }))
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const episodeId = /_(\d+)\.html/.exec(chapter.url)?.[1] ?? '';
      const data = await api<{ authPass?: number; content?: { imageUrl: string }[] }>('/read/pcw/1.0/read', [
        ['episodeId', episodeId],
      ]);
      if (data.authPass !== 1 || !data.content?.length) throw new Error('本章为付费章节');
      return data.content.map((p, index) => ({ index, imageUrl: p.imageUrl }));
    },
    imageHeaders: () => headers,
    getWebUrl(item) {
      const id = item.url.includes('/reader/') ? /\/reader\/(\d+)_/.exec(item.url)?.[1] : comicId(item.url);
      return `${BASE_URL}/detail/${id}`;
    },
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)\/detail\/(\d+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase() !== hostOf(BASE_URL)) return null;
      return { url: `/detail_${match[2]}.html`, title: '' };
    },
  }),
});
