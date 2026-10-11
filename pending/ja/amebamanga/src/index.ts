import {
  type Chapter,
  type Filter,
  type FilterState,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type TileOp,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://dokusho-ojikan.jp';
const API_URL = 'https://api.dokusho-ojikan.jp/dokusho-server';
const PAGE_SIZE = 50;
const HIDE_LOCKED = 'hide_locked';
const headers = { 'User-Agent': USER_AGENT, Cookie: 'AC=1', Referer: `${BASE_URL}/` };

// [id, label, [label, value][]]
const SELECTS: [string, string, [string, string][]][] = [
  [
    'sort',
    '並び替え',
    [
      ['人気順', 'monthly_spend'],
      ['新着順', 'new'],
      ['関連度順', 'score'],
      ['あいうえお順', 'title_initial'],
      ['評価高い順', 'title_review'],
      ['評価多い順', 'title_review_count'],
    ],
  ],
  [
    'genre',
    'ジャンル',
    [
      ['すべて', ''],
      ['少女', '3'],
      ['女性', '5'],
      ['少年', '2'],
      ['青年', '4'],
      ['TL', '8'],
      ['BL', '9'],
      ['メンズ', '7'],
      ['ライトノベル', '11'],
      ['小説', '12'],
      ['文芸', '13'],
      ['ビジネス', '14'],
      ['実用', '15'],
      ['雑誌', '16'],
      ['写真集', '17'],
    ],
  ],
  [
    'publisher',
    '出版社',
    [
      ['すべて', ''],
      ['KADOKAWA', '1223'],
      ['小学館', '90'],
      ['講談社', '12'],
      ['集英社', '111'],
      ['白泉社', '118'],
      ['双葉社', '14'],
      ['ぶんか社', '95'],
      ['秋田書店', '34'],
      ['新潮社', '288'],
      ['スクウェア・エニックス', '110'],
      ['リブレ', '160'],
      ['モバイル・メディアリサーチ', '109'],
      ['スクリーモ', '314'],
      ['SBクリエイティブ', '3238'],
      ['SBクリエイティブ/GA文庫', '3239'],
    ],
  ],
  [
    'magazine',
    '掲載誌',
    [
      ['すべて', ''],
      ['プチコミック', '160'],
      ['Cheese!', '164'],
      ['デザート', '8'],
      ['マーガレット', '284'],
      ['別冊フレンド', '14'],
      ['Betsucomi', '530'],
      ['花とゆめ', '339'],
      ['裏サンデー女子部', '1080'],
      ['少年ジャンプ+', '608'],
      ['週刊少年ジャンプ', '280'],
      ['週刊少年マガジン', '7'],
      ['少年サンデー', '432'],
      ['モーニング', '11'],
      ['ビッグスピリッツ', '536'],
    ],
  ],
  [
    'reviewrating',
    'レビュー評価',
    [
      ['すべて', ''],
      ['4.5以上', '4.5'],
      ['4.0以上', '4'],
      ['3.5以上', '3.5'],
      ['3.0以上', '3'],
    ],
  ],
  [
    'volume',
    '巻数',
    [
      ['すべて', ''],
      ['1巻のみ', 'to:1'],
      ['5巻以下', 'to:5'],
      ['10巻以下', 'to:10'],
      ['10巻以上', 'from:10'],
    ],
  ],
];
const PARAMS: Record<string, string> = {
  sort: 'sort_key',
  genre: 'genre_id',
  review: 'title_review_ave_from',
  publisher: 'pub_id',
  magazine: 'magazine_id',
};
const CATEGORIES: [string, string][] = [
  ['総合', 'general'],
  ['恋愛', 'love'],
  ['人間ドラマ', 'drama'],
  ['エッセイ', 'essay'],
  ['TL', 'tl'],
  ['ラブストーリー', 'mens_love'],
  ['グルメ', 'gourmet'],
  ['異世界', 'isekai'],
  ['推理・サスペンス', 'mystery'],
  ['ホラー', 'horror'],
  ['日常', 'daily_life'],
  ['ギャグ・コメディ', 'comedy'],
  ['アングラ・裏社会', 'underground'],
  ['バトル', 'battle'],
  ['SF', 'sf'],
  ['カルチャー', 'culture'],
  ['スポーツ', 'sport'],
  ['動物・ペット', 'animal'],
  ['歴史', 'history'],
  ['医療', 'medical'],
  ['冒険', 'adventure'],
  ['社会派', 'social_issues'],
  ['レディコミ', 'ladies'],
  ['BL', 'bl'],
  ['グリム童話', 'grimm'],
  ['メンズ', 'adult'],
  ['ロマンス', 'romance'],
  ['ミリタリー', 'military'],
];
const CHECKS: [string, string, string, string][] = [
  ['free', '無料', 'book_price', '0'],
  ['discount', '割引', 'price_type', 'discount'],
  ['completed', '完結', 'tags_id', '240'],
  ['animated', 'アニメ化', 'meta_item_id', '3'],
  ['liveaction', '実写化', 'meta_item_id', '49'],
  ['hasserial', '無料連載で読める', 'has_serial', 'true'],
  ['releasedthismonth', '1ヶ月以内に販売した作品', 'start_datetime_within_days', '30'],
];

interface Title {
  titleId: number;
  titleName: string;
  imageUrl?: string | null;
  maxBook?: { imageUrl?: string | null } | null;
}

const api = async <T>(path: string) =>
  (await http.get<T>(`${API_URL}/${path}`, { headers, responseType: 'json' })).body;
const toManga = (t: Title): MangaSummary => ({
  url: `/${t.titleId}`,
  title: t.titleName,
  thumbnailUrl: t.imageUrl ?? t.maxBook?.imageUrl ?? undefined,
});

async function list(path: string, offset: number): Promise<MangaPage> {
  const r = await api<{ totalCount: number; titleRankResponses?: Title[]; books?: Title[]; results?: Title[] }>(path);
  const titles = r.titleRankResponses ?? r.books ?? r.results ?? [];
  return { items: titles.map(toManga), hasNextPage: offset + PAGE_SIZE < r.totalCount };
}

/** The reader's randomizer (a 15-bit LCG seeded from the key). */
function shuffleOrder(key: string, total: number): number[] {
  let next = 0;
  for (let i = 0; i < key.length; i += 2) {
    next += (key.charCodeAt(i) << 8) | (i + 1 < key.length ? key.charCodeAt(i + 1) : 0);
  }
  const rand = (max: number) => {
    next = (next * 1103515245 + 12345) % 32768;
    return Math.floor(next / (Math.floor(32767 / (max + 1)) + 1));
  };
  const l = Array.from({ length: total }, (_, i) => i);
  for (let i = 0; i < l.length; i++) {
    const n = rand(l.length - 1);
    const t = l[n]!;
    l[n] = l[i]!;
    l[i] = t;
  }
  return l;
}

function imageSize(bytes: Uint8Array): [number, number] | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return [view.getUint32(16), view.getUint32(20)];
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let i = 2; i + 9 < bytes.length;) {
      if (bytes[i] !== 0xff) return undefined;
      const marker = bytes[i + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return [view.getUint16(i + 7), view.getUint16(i + 5)];
      i += 2 + view.getUint16(i + 2);
    }
  }
  return undefined;
}

export default defineExtension({
  preferences: () => [{ type: 'switch', key: HIDE_LOCKED, label: 'Hide Locked Chapters', default: false }],
  createSource: () => ({
    baseUrl: BASE_URL,
    imageHeaders: () => headers,
    getPopular(page) {
      const offset = (page - 1) * PAGE_SIZE;
      return list(
        `rank/title/category?ac=1&term_code=monthly&category=page_type_all&offset=${offset}&limit=${PAGE_SIZE}`,
        offset,
      );
    },
    getLatest(page) {
      const offset = (page - 1) * PAGE_SIZE;
      return list(
        `release/book/recent?ac=1&category=page_type_all&sort=releaseDate&offset=${offset}&limit=${PAGE_SIZE}`,
        offset,
      );
    },
    getFilters(): Filter[] {
      return [
        ...SELECTS.map(([id, label, opts]): Filter => ({
          type: 'select',
          id,
          label,
          options: opts.map(([l, value]) => ({ value, label: l })),
        })),
        {
          type: 'group',
          id: 'category',
          label: 'カテゴリ',
          filters: CATEGORIES.map(([label, id]): Filter => ({ type: 'checkbox', id: `category.${id}`, label })),
        },
        { type: 'header', label: 'こだわり条件' },
        ...CHECKS.map(([id, label]): Filter => ({ type: 'checkbox', id, label })),
      ];
    },
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const offset = (page - 1) * PAGE_SIZE;
      const q: string[] = ['ac=1', `word=${encodeURIComponent(query)}`, `offset=${offset}`, `limit=${PAGE_SIZE}`];
      for (const [id] of SELECTS) {
        const v = typeof filters[id] === 'string' ? (filters[id] as string) : id === 'sort' ? 'monthly_spend' : '';
        if (!v) continue;
        if (id === 'volume') {
          const [dir, count] = v.split(':');
          q.push(`${dir === 'to' ? 'max_book_vol_to' : 'max_book_vol_from'}=${count}`);
        } else if (PARAMS[id]) q.push(`${PARAMS[id]}=${encodeURIComponent(v)}`);
      }
      for (const [id, v] of Object.entries(filters)) {
        if (id.startsWith('category.') && v === true) q.push(`category_id=${id.slice(9)}`);
      }
      for (const [id, , param, value] of CHECKS) if (filters[id] === true) q.push(`${param}=${value}`);
      return list(`search/search/v2?${q.join('&')}`, offset);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const d = await api<{
        name: string;
        imageUrl?: string | null;
        categories?: { name: string }[];
        pub?: { name: string } | null;
        description?: string | null;
        authors?: { name: string }[];
        completeFlg?: boolean;
        metaList?: { label: string }[];
        eroticType?: number;
      }>(`titles/${manga.url.slice(1)}?ac=1`);
      let description = d.description ?? '';
      if (d.pub) description += `\n\nPublisher: ${d.pub.name}`;
      if (d.eroticType === 4) description += '\n\n18+';
      return {
        url: manga.url,
        title: d.name,
        thumbnailUrl: d.imageUrl ?? manga.thumbnailUrl,
        author: d.authors?.map((a) => a.name).join(', ') || undefined,
        description,
        genres: [...(d.categories ?? []).map((c) => c.name), ...(d.metaList ?? []).map((m) => m.label)],
        status: d.completeFlg ? 'completed' : 'ongoing',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const hideLocked = prefs.get<boolean>(HIDE_LOCKED) === true;
      const r = await api<{
        books: {
          id: number;
          contentsName: string;
          vol?: number | null;
          discount?: { type: string } | null;
          startDatetime?: string | null;
        }[];
      }>(
        `books/by_title/v3?ac=1&title_id=${manga.url.slice(1)}&sales_status=IN_RESERVATION&sales_status=ON_SALE&sort=VOL_DESC&offset=0&limit=1000`,
      );
      return r.books
        .map((b) => ({ locked: b.discount?.type !== 'FREE', b }))
        .filter((x) => !hideLocked || !x.locked)
        .map(({ locked, b }) => ({
          url: `/reader/${b.id}`,
          name: `${locked ? '🔒 ' : ''}${b.contentsName}`,
          number: b.vol ?? undefined,
          uploadedAt: b.startDatetime ? Date.parse(b.startDatetime) : undefined,
        }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const res = await http.request<{
        result: {
          guardianServer: string;
          signedParams: string;
          bookData: { s3_key: string; imaged_reflow?: boolean };
          keys?: Record<string, string> | string[] | null;
        };
      }>({
        url: `${API_URL}/browser/bookinfo/v3?bookId=${chapter.url.split('/').pop()}`,
        headers,
        responseType: 'json',
      });
      if (res.status === 500) throw new Error('Log in via WebView and purchase this product to read.');
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const r = res.body.result;
      const guardian = `${r.guardianServer}/${r.bookData.s3_key}`;
      const url = (path: string, key: string) => `${guardian}/${path}?${r.signedParams}#${key}`;
      if (!r.bookData.imaged_reflow) {
        const keys = r.keys as string[] | null | undefined;
        if (!keys) throw new Error('Log in via WebView and purchase this product to read.');
        return keys.map((key, i) => ({ index: i, imageUrl: url(`${i + 1}.jpg`, key) }));
      }
      const book = (
        await http.get<{ reflowData: { profiles: { id: string; bookInfo: { page_count: number } }[] } }>(
          `${guardian}/book.json?${r.signedParams}`,
          { headers, responseType: 'json' },
        )
      ).body;
      const profiles = book.reflowData.profiles;
      const profile = profiles.find((p) => p.id === 'mincho_medium') ?? profiles[0]!;
      const key = (r.keys as Record<string, string>)[profile.id]!;
      return Array.from({ length: profile.bookInfo.page_count }, (_, i) => ({
        index: i,
        imageUrl: url(`${profile.id}/${i + 1}.jpg`, key),
      }));
    },
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      const key = (page.imageUrl ?? '').split('#')[1];
      if (!key) return {};
      const size = imageSize(bytes);
      if (!size) return {};
      const [width, height] = size;
      const bw = 96;
      const bh = 128;
      const cols = Math.floor(width / bw);
      const rows = Math.floor(height / bh);
      const l = shuffleOrder(key, cols * rows);
      const ops: TileOp[] = [];
      for (let s = 0; s < cols * rows; s++) {
        const c = l[s]!;
        ops.push({
          sx: (s % cols) * bw,
          sy: Math.floor(s / cols) * bh,
          w: bw,
          h: bh,
          dx: (c % cols) * bw,
          dy: Math.floor(c / cols) * bh,
        });
      }
      if (width % bw > 0) ops.push({ sx: cols * bw, sy: 0, w: width - cols * bw, h: height, dx: cols * bw, dy: 0 });
      if (height % bh > 0)
        ops.push({ sx: 0, sy: rows * bh, w: cols * bw, h: height - rows * bh, dx: 0, dy: rows * bh });
      return { tiles: { width, height, ops } };
    },
    getWebUrl: (item) =>
      item.url.startsWith('/reader/')
        ? `${BASE_URL}/reader/index.html?cid=${item.url.split('/').pop()}`
        : `${BASE_URL}/series_list/series_id=${item.url.slice(1)}`,
  }),
});
