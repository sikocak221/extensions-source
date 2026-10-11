import {
  type Chapter,
  type Filter,
  type FilterState,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://cycomi.com';
const API = 'https://web.cycomi.com/api';
const HIDE_LOCKED = 'hide_locked';

const headers = () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, Origin: BASE_URL });

async function api<T>(path: string): Promise<T> {
  return (await http.get<{ data: T }>(`${API}${path}`, { headers: headers(), responseType: 'json' })).body.data;
}

interface Title {
  titleId: number;
  titleName: string;
  image: string;
}
const summary = (t: Title): MangaSummary => ({ url: `/title/${t.titleId}`, title: t.titleName, thumbnailUrl: t.image });
const idOf = (url: string) => /\/title\/(\d+)/.exec(url)?.[1] ?? '';

const DAYS: [string, string][] = [
  ['月曜日', '1'],
  ['火曜日', '2'],
  ['水曜日', '3'],
  ['木曜日', '4'],
  ['金曜日', '5'],
  ['土曜日', '6'],
  ['日曜日', '0'],
  ['他', '7'],
];

/** RC4 with the key taken from the image path. */
function rc4(data: Uint8Array, key: Uint8Array): Uint8Array {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i]! + key[i % key.length]!) & 255;
    [s[i], s[j]] = [s[j]!, s[i]!];
  }
  const out = new Uint8Array(data.length);
  let a = 0;
  let b = 0;
  for (let n = 0; n < data.length; n++) {
    a = (a + 1) & 255;
    b = (b + s[a]!) & 255;
    [s[a], s[b]] = [s[b]!, s[a]!];
    out[n] = data[n]! ^ s[(s[a]! + s[b]!) & 255]!;
  }
  return out;
}

export default defineExtension({
  preferences: () => [{ type: 'switch', key: HIDE_LOCKED, label: 'Hide Paid Chapters', default: false }],
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const list = await api<Title[]>('/titleRanking/title/list?categoryId=1');
      return { items: list.map(summary), hasNextPage: false };
    },
    async getLatest(): Promise<MangaPage> {
      const jst = new Date(Date.now() + (9 - 12) * 3600_000);
      const day = jst.getUTCDay();
      const data = await api<{ titles: Title[] }>(`/title/serialization/list/${day}`);
      return { items: data.titles.map(summary), hasNextPage: false };
    },
    getFilters: (): Filter[] => [
      { type: 'select', id: 'category', label: 'Category', options: DAYS.map(([label, value]) => ({ label, value })) },
    ],
    async search(query: string, _page: number, filters: FilterState): Promise<MangaPage> {
      const path = query
        ? `/search/list/1?word=${encodeURIComponent(query)}`
        : `/title/serialization/list/${(filters.category as string) || '1'}`;
      const data = await api<{ titles: Title[] }>(path);
      return { items: data.titles.map(summary), hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const d = await api<{
        author?: string;
        body?: string;
        image?: string;
        titleId: number;
        titleName: string;
        serialType?: string;
      }>(`/title/detail?titleId=${idOf(manga.url)}`);
      return {
        url: `/title/${d.titleId}`,
        title: d.titleName,
        thumbnailUrl: d.image,
        author: d.author || undefined,
        description: d.body || undefined,
        status: d.serialType === 'end' || d.serialType === 'shot' ? 'completed' : 'ongoing',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const id = idOf(manga.url);
      const hideLocked = prefs.get<boolean>(HIDE_LOCKED) === true;
      const locked = new Map<number, boolean>();
      try {
        const status = await api<
          {
            id: number;
            isFreeCampaign?: boolean;
            purchaseUseCoin?: number;
            rentalUseCoin?: number;
            rentalExpirationAt?: number | null;
          }[]
        >(`/chapter/status/list?titleId=${id}`);
        for (const s of status) {
          locked.set(
            s.id,
            s.isFreeCampaign === false &&
              (s.purchaseUseCoin !== 0 || s.rentalUseCoin !== 0) &&
              (s.rentalExpirationAt ?? null) === null,
          );
        }
      } catch {
        // chapter locks unknown
      }
      const list = await api<{ id: number; name: string; subName?: string; startAt?: number }[]>(
        `/chapter/paginatedList?titleId=${id}&sort=2`,
      );
      return list
        .filter((c) => !(hideLocked && locked.get(c.id)))
        .map((c) => ({
          url: `/title/${id}/chapter/${c.id}`,
          name: `${locked.get(c.id) ? '🔒 ' : ''}${c.name}${c.subName ? ` - ${c.subName}` : ''}`,
          uploadedAt: c.startAt || undefined,
        }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const m = /\/title\/(\d+)\/chapter\/(\d+)/.exec(chapter.url);
      const res = await http.post<{ data: { pages: { image: string; pageNumber: number }[] } }>(
        `${API}/chapter/page/list`,
        { json: { titleId: Number(m?.[1]), chapterId: Number(m?.[2]) } },
        { headers: headers(), responseType: 'json' },
      );
      const pages = res.body.data.pages;
      if (!pages.length) throw new Error('Log in via WebView and rent or purchase this chapter to read.');
      return pages.map((p, index) => ({ index, imageUrl: `${p.image}#decrypt` }));
    },
    imageHeaders: () => headers(),
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      const url = (page.imageUrl ?? '').replace(/#.*$/, '').replace(/\?.*$/, '');
      const key = url.replace(/^https?:\/\/[^/]+\//, '').split('/')[3] ?? '';
      if (!key || key.includes('end_page')) return {};
      return { bytes: rc4(bytes, Uint8Array.from(utf8.encode(key))) };
    },
    getWebUrl: (item) =>
      /^\/title\//.test(item.url) && item.url.includes('/chapter/')
        ? `${BASE_URL}/viewer/chapter/${item.url.split('/').pop()}`
        : `${BASE_URL}${item.url}`,
    resolveUrl(url: string): MangaSummary | null {
      const m = /^https?:\/\/cycomi\.com\/title\/(\d+)/i.exec(url.trim());
      return m ? { url: `/title/${m[1]}`, title: '' } : null;
    },
  }),
});
