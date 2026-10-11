import {
  type Chapter,
  type Filter,
  type FilterState,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://comic-walker.com';
const API_URL = `${BASE_URL}/api`;
const PAGE_LIMIT = 30;
const IMAGE_SIZE = 'width:1284';
const HIDE_LOCKED = 'hide_locked';
const AUTHOR_ROLES = ['原作', '著者'];
const ARTIST_ROLES = ['漫画', '作画', '著者'];

const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const get = async <T>(path: string) =>
  (await http.get<T>(`${API_URL}/${path}`, { headers, responseType: 'json' })).body;

interface Series {
  code: string;
  originalThumbnail?: string | null;
  bookCover?: string | null;
  title: string;
}
interface SeriesResponse {
  result: Series[];
  total?: number | null;
  pagination?: { total: number } | null;
}

const toSummary = (s: Series): MangaSummary => ({
  url: `/detail/${s.code}`,
  title: s.title,
  thumbnailUrl: s.bookCover ?? s.originalThumbnail ?? undefined,
});

async function list(path: string, offset: number): Promise<MangaPage> {
  const r = await get<SeriesResponse>(path);
  return {
    items: r.result.map(toSummary),
    hasNextPage: offset + PAGE_LIMIT < (r.total ?? r.pagination?.total ?? 0),
  };
}

const hexBytes = (hex: string) => {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
};

export default defineExtension({
  preferences: () => [{ type: 'switch', key: HIDE_LOCKED, label: 'Hide Unavailable Chapters', default: false }],
  createSource: () => ({
    baseUrl: BASE_URL,
    imageHeaders: () => headers,
    getPopular: (page) =>
      list(`ranking?limit=${PAGE_LIMIT}&offset=${(page - 1) * PAGE_LIMIT}`, (page - 1) * PAGE_LIMIT),
    getLatest: (page) =>
      list(`series/new?limit=${PAGE_LIMIT}&offset=${(page - 1) * PAGE_LIMIT}`, (page - 1) * PAGE_LIMIT),
    getFilters(): Filter[] {
      return [
        { type: 'header', label: 'Note: Search and filters are applied together' },
        {
          type: 'select',
          id: 'sort',
          label: 'Sort by',
          options: [
            { value: 'popularity', label: '人気順' },
            { value: 'update', label: '更新順' },
          ],
        },
      ];
    },
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const sort = typeof filters.sort === 'string' ? filters.sort : 'popularity';
      const offset = (page - 1) * PAGE_LIMIT;
      return list(
        `search/keywords?keywords=${encodeURIComponent(query)}&limit=${PAGE_LIMIT}&offset=${offset}&sortBy=${sort}`,
        offset,
      );
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const code = manga.url.split('/').pop()!;
      const { work: w } = await get<{
        work: {
          originalThumbnail?: string | null;
          bookCover?: string | null;
          title: string;
          nextUpdateDateText?: string | null;
          serializationStatus?: string | null;
          tags?: { name: string }[] | null;
          genre?: { name: string } | null;
          subGenre?: { name: string } | null;
          summary?: string | null;
          authors?: { name: string; role: string }[] | null;
        };
      }>(`contents/details/work?workCode=${code}`);
      const authors = w.authors ?? [];
      const names = (roles: string[]) =>
        authors
          .filter((a) => roles.includes(a.role))
          .map((a) => a.name)
          .join(', ') || undefined;
      const s = (w.serializationStatus ?? '').toLowerCase();
      const status: MangaStatus = s === 'ongoing' ? 'ongoing' : s === 'finished' ? 'completed' : 'unknown';
      return {
        url: manga.url,
        title: w.title,
        thumbnailUrl: w.bookCover ?? w.originalThumbnail ?? manga.thumbnailUrl,
        description: `${w.summary ?? ''}${w.nextUpdateDateText ? `\n\nNext Update: ${w.nextUpdateDateText}` : ''}`,
        author: names(AUTHOR_ROLES),
        artist: names(ARTIST_ROLES),
        genres: [w.genre?.name, w.subGenre?.name, ...(w.tags ?? []).map((t) => t.name)].filter((x): x is string => !!x),
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const hideLocked = prefs.get<boolean>(HIDE_LOCKED) === true;
      const code = manga.url.split('/').pop()!;
      const r = await get<{
        work: { code: string };
        latestEpisodes: {
          result: {
            id: string;
            code: string;
            title: string;
            subTitle?: string | null;
            updateDate?: string | null;
            internal: { episodeNo: number };
            isActive: boolean;
          }[];
        };
      }>(`contents/details/work?workCode=${code}`);
      return r.latestEpisodes.result
        .filter((e) => !hideLocked || e.isActive)
        .map((e) => ({
          url: `/${r.work.code}/${e.code}/${e.id}`,
          name: `${e.isActive ? '' : '🔒 '}${e.subTitle ? `${e.title} - ${e.subTitle}` : e.title}`,
          number: e.internal.episodeNo,
          uploadedAt: e.updateDate ? Date.parse(e.updateDate) : undefined,
        }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const id = chapter.url.split('/').pop()!;
      const r = await get<{ manuscripts: { drmHash: string; drmImageUrl: string }[] }>(
        `contents/viewer?episodeId=${encodeURIComponent(id)}&imageSizeType=${encodeURIComponent(IMAGE_SIZE)}`,
      );
      if (!r.manuscripts.length) throw new Error('このチャプターは非公開です\nChapter is not available!');
      return r.manuscripts.map((m, index) => ({ index, imageUrl: `${m.drmImageUrl}#${m.drmHash}` }));
    },
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      const hash = (page.imageUrl ?? '').split('#')[1];
      if (!hash) return {};
      const key = hexBytes(hash);
      if (!key.length) return {};
      const out = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) out[i] = bytes[i]! ^ key[i % key.length]!;
      return { bytes: out };
    },
    getWebUrl(item) {
      const parts = item.url.split('/');
      return parts.length >= 4 ? `${BASE_URL}/detail/${parts[1]}/episodes/${parts[2]}` : `${BASE_URL}${item.url}`;
    },
  }),
});
