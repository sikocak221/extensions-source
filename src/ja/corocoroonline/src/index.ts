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
import { type Fields, int, message, messages, readProto, text } from './proto';

const BASE_URL = 'https://www.corocoro.jp';
const API_URL = `${BASE_URL}/api/csr`;
const HIDE_LOCKED = 'hide_locked';
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const CATEGORIES: [string, string][] = [
  ['月', 'mon'],
  ['火', 'tue'],
  ['水', 'wed'],
  ['木', 'thu'],
  ['金', 'fri'],
  ['土', 'sat'],
  ['日', 'sun'],
  ['完結', 'completed'],
  ['無料', 'one-shot'],
  ['今日の急上昇', '2:ranking'],
  ['月間総合', '3:ranking'],
  ['完結', '17:tag'],
  ['ギャグ・コメディ', '32:tag'],
  ['バトル', '2:tag'],
  ['ゲーム', '35:tag'],
  ['ヒューマンドラマ', '41:tag'],
  ['異世界・ファンタジー', '44:tag'],
  ['ホビー', '38:tag'],
  ['デュエル・マスターズ', '170:tag'],
  ['アニメ化', '20:tag'],
  ['スポーツ', '47:tag'],
  ['ベイブレード', '125:tag'],
  ['ポケモン', '140:tag'],
];

async function proto(url: string, method: 'GET' | 'PUT' = 'GET'): Promise<Fields> {
  const res = await http.request<string>({
    url,
    method,
    headers,
    body: method === 'PUT' ? '' : undefined,
    responseType: 'bytes',
  });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  return readProto(base64.decodeBytes(res.body));
}

const toManga = (t: Fields): MangaSummary => ({
  url: `/${int(t, 1)}`,
  title: text(t, 3) ?? '',
  thumbnailUrl: (() => {
    const img = message(t, 5);
    return img ? text(img, 1) : undefined;
  })(),
});

const hexBytes = (hex: string) => {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
};

async function ranking(category: string | undefined): Promise<MangaPage> {
  const root = await proto(`${API_URL}?rq=title/list/ranking`);
  const lists = messages(root, 2);
  let chosen: Fields | undefined;
  if (!category) chosen = lists[0];
  else {
    const [id, type] = category.split(':');
    chosen = lists.find((l) => {
      const tag = message(l, 1);
      return tag && text(tag, 1) === id && text(tag, 2) === type;
    });
  }
  if (!chosen) return { items: [], hasNextPage: false };
  const titles = message(chosen, 2);
  let items: MangaSummary[] = [];
  if (titles) items = messages(titles, 1).map(toManga);
  else {
    const chapters = message(chosen, 3);
    if (chapters) {
      const seen = new Set<string>();
      for (const c of messages(chapters, 1)) {
        const t = message(c, 2);
        if (!t) continue;
        const m = toManga(t);
        if (!seen.has(m.url)) {
          seen.add(m.url);
          items.push(m);
        }
      }
    }
  }
  return { items, hasNextPage: false };
}

async function updateDay(day: string): Promise<MangaPage> {
  const root = await proto(`${API_URL}?rq=title/list/update_day&day=${day}`);
  const list = message(root, 1);
  const titles = list ? messages(list, 2) : [];
  return { items: titles.map(toManga), hasNextPage: false };
}

async function seriesList(url: string): Promise<MangaPage> {
  const res = await http.get(url, { headers });
  const doc = html.load(res.body, { baseUrl: res.url });
  const items: MangaSummary[] = [];
  for (const a of doc.select("div.grid > a[href^='/title/']")) {
    const id = (a.absUrl('href') ?? '').split('/').filter(Boolean).pop();
    const title = (a.selectFirst('p.text-black') ?? a.selectFirst('p'))?.text().trim();
    if (!id || !title) continue;
    items.push({ url: `/${id}`, title, thumbnailUrl: a.selectFirst('img')?.absUrl('src') });
  }
  return { items, hasNextPage: false };
}

export default defineExtension({
  preferences: () => [{ type: 'switch', key: HIDE_LOCKED, label: 'Hide Paid Chapters', default: false }],
  createSource: () => ({
    baseUrl: BASE_URL,
    imageHeaders: () => headers,
    getPopular: () => ranking(undefined),
    getLatest: () => updateDay(WEEKDAYS[(new Date(Date.now() + 9 * 3600_000).getUTCDay() + 6) % 7]!),
    getFilters(): Filter[] {
      return [
        {
          type: 'select',
          id: 'category',
          label: 'Category',
          options: CATEGORIES.map(([label, value]) => ({ value, label })),
        },
      ];
    },
    search(query: string, _page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) return seriesList(`${BASE_URL}/search?keyword=${encodeURIComponent(query)}`);
      const category = typeof filters.category === 'string' ? filters.category : 'mon';
      if (WEEKDAYS.includes(category)) return updateDay(category);
      if (category === 'completed' || category === 'one-shot') return seriesList(`${BASE_URL}/rensai/${category}`);
      return ranking(category);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const root = await proto(`${API_URL}?rq=title/detail&title_id=${manga.url.slice(1)}`);
      const title = message(root, 2);
      return {
        ...(title ? toManga(title) : manga),
        author:
          messages(root, 3)
            .map((a) => text(a, 2))
            .filter(Boolean)
            .join(', ') || undefined,
        description: text(root, 6),
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const hideLocked = prefs.get<boolean>(HIDE_LOCKED) === true;
      const root = await proto(`${API_URL}?rq=title/detail&title_id=${manga.url.slice(1)}`);
      const chapters: Chapter[] = [];
      for (const c of messages(root, 8)) {
        const points = message(c, 5);
        const locked = !!points && int(points, 2) !== undefined;
        if (hideLocked && locked) continue;
        const name = `${locked ? '🔒 ' : ''}${text(c, 2) ?? ''}`;
        const m = /第(\d+)(?:\.(\d+))?話/.exec(name);
        chapters.push({
          url: `/chapter/${int(c, 1)}`,
          name,
          number: m ? parseFloat(m[2] ? `${m[1]}.${m[2]}` : m[1]!) : undefined,
          uploadedAt: (int(c, 9) ?? 0) * 1000,
        });
      }
      const first = chapters[0];
      const last = chapters[chapters.length - 1];
      const ascending =
        first && last
          ? first.uploadedAt !== last.uploadedAt
            ? (first.uploadedAt ?? 0) < (last.uploadedAt ?? 0)
            : first.number !== undefined && last.number !== undefined
              ? first.number < last.number
              : Number(first.url.split('/').pop()) < Number(last.url.split('/').pop())
          : false;
      return ascending ? chapters.reverse() : chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      let root: Fields;
      try {
        root = await proto(`${API_URL}?rq=chapter/viewer&chapter_id=${chapter.url.split('/').pop()}`, 'PUT');
      } catch {
        throw new Error('Log in via WebView and purchase this chapter to read.');
      }
      const key = text(root, 19);
      const iv = text(root, 20);
      const pages = messages(root, 2);
      if (!key || !iv || !pages.length) throw new Error('Log in via WebView and purchase this chapter to read.');
      return pages.map((p, index) => ({ index, imageUrl: `${text(p, 1)}#${key}:${iv}` }));
    },
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      const fragment = (page.imageUrl ?? '').split('#')[1];
      if (!fragment || !fragment.includes(':')) return {};
      const [key, iv] = fragment.split(':') as [string, string];
      return { bytes: crypto.aesDecrypt(bytes, hexBytes(key), { mode: 'cbc', iv: hexBytes(iv) }) };
    },
    getWebUrl: (item) => (item.url.startsWith('/chapter/') ? BASE_URL + item.url : `${BASE_URL}/title${item.url}`),
  }),
});
