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
  type TileOp,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf } from './common/utils';
import { imageSize } from './image';

const BASE_URL = 'https://piccoma.com';
const HIDE_LOCKED = 'hide_locked';
const TILE_SIZE = 50;
const BITMASK = 3236551;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const xHeaders = { ...headers, 'X-Requested-With': 'XMLHttpRequest' };

/** [label, ranking path] */
const RANKINGS: [string, string][] = [
  ['(マンガ) 総合', 'K/P/0'],
  ['(マンガ) ファンタジー', 'K/P/2'],
  ['(マンガ) 恋愛', 'K/P/1'],
  ['(マンガ) アクション', 'K/P/5'],
  ['(マンガ) ドラマ', 'K/P/3'],
  ['(マンガ) ホラー・ミステリー', 'K/P/7'],
  ['(マンガ) 裏社会・アングラ', 'K/P/9'],
  ['(マンガ) スポーツ', 'K/P/6'],
  ['(マンガ) グルメ', 'K/P/10'],
  ['(マンガ) 日常', 'K/P/4'],
  ['(マンガ) 雑誌', 'K/P/16'],
  ['(マンガ) TL', 'K/P/13'],
  ['(マンガ) BL', 'K/P/14'],
  ['(Smartoon) All', 'S/P/0'],
  ['(Smartoon) ファンタジー', 'S/P/2'],
  ['(Smartoon) 恋愛', 'S/P/1'],
  ['(Smartoon) アクション', 'S/P/5'],
  ['(Smartoon) ドラマ', 'S/P/3'],
  ['(Smartoon) ホラー・ミステリー', 'S/P/7'],
  ['(Smartoon) 裏社会・アングラ', 'S/P/9'],
  ['(Smartoon) スポーツ', 'S/P/6'],
  ['(Smartoon) グルメ', 'S/P/10'],
  ['(Smartoon) 日常', 'S/P/4'],
  ['(Smartoon) TL', 'S/P/13'],
  ['(Smartoon) BL', 'S/P/14'],
  ['(ノベル) 総合', 'N/P/0'],
  ['(ノベル) ファンタジー', 'N/P/2'],
  ['(ノベル) 恋愛', 'N/P/1'],
  ['(ノベル) ドラマ', 'N/P/3'],
  ['(ノベル) ホラー・ミステリー', 'N/P/7'],
  ['(ノベル) TL', 'N/P/13'],
  ['(ノベル) BL', 'N/P/14'],
];

const load = async (url: string, extra: Record<string, string> = headers) => {
  const response = await http.get(url, { headers: extra });
  return html.load(response.body, { baseUrl: url });
};

// --- seedrandom (https://github.com/davidbau/seedrandom), as used by the site's image scrambler ---
const WIDTH = 256;
const CHUNKS = 6;
const DIGITS = 52;
const MASK = WIDTH - 1;

class SeedRandom {
  private readonly s = Array.from({ length: WIDTH }, (_, i) => i);
  private i = 0;
  private j = 0;

  constructor(seed: string) {
    const key = new Array<number>(WIDTH).fill(0);
    let smear = 0;
    for (let j = 0; j < seed.length; j++) {
      smear ^= key[MASK & j]! * 19;
      key[MASK & j] = MASK & (smear + seed.charCodeAt(j));
    }
    const mixed = key.slice(0, Math.min(seed.length, WIDTH));
    const effective = mixed.length ? mixed : [0];
    let jc = 0;
    for (let k = 0; k < WIDTH; k++) {
      const t = this.s[k]!;
      jc = MASK & (jc + effective[k % effective.length]! + t);
      this.s[k] = this.s[jc]!;
      this.s[jc] = t;
    }
    this.g(WIDTH);
  }

  private g(count: number): number {
    let r = 0;
    for (let c = count; c-- > 0;) {
      this.i = MASK & (this.i + 1);
      const t = this.s[this.i]!;
      this.j = MASK & (this.j + t);
      const sj = this.s[this.j]!;
      this.s[this.i] = sj;
      this.s[this.j] = t;
      r = r * WIDTH + this.s[MASK & (sj + t)]!;
    }
    return r;
  }

  nextDouble(): number {
    const significance = 2 ** DIGITS;
    const overflow = significance * 2;
    let n = this.g(CHUNKS);
    let d = WIDTH ** CHUNKS;
    let x = 0;
    while (n < significance) {
      n = (n + x) * WIDTH;
      d *= WIDTH;
      x = this.g(1);
    }
    while (n >= overflow) {
      n /= 2;
      d /= 2;
      x = Math.floor(x / 2);
    }
    return (n + x) / d;
  }

  shuffle<T>(list: T[]): T[] {
    const keys = list.map((_, i) => i);
    const out: T[] = [];
    for (let n = list.length; n > 0; n--) {
      const r = Math.floor(this.nextDouble() * keys.length);
      out.push(list[keys.splice(r, 1)[0]!]!);
    }
    return out;
  }
}

/** Seed from the checksum path segment, rotated by the digit sum of `expires`, then bit-flipped by a mask. */
function extractSeed(url: string): string {
  const path = url
    .replace(/^https?:\/\/[^/]+/, '')
    .split('?')[0]!
    .split('/');
  const checksum = path[4]!; // pathSegments[3]
  const expires = /[?&]expires=(\d+)/.exec(url)?.[1] ?? '';
  const sum = [...expires].reduce((a, c) => a + Number(c), 0);
  const residual = sum % checksum.length;
  const rotated = checksum.slice(checksum.length - residual) + checksum.slice(0, checksum.length - residual);
  return [...rotated]
    .map((c, i) => (((BITMASK >> i) & 1) === 1 ? String.fromCharCode(c.charCodeAt(0) ^ 1) : c))
    .join('');
}

const toCoverUrl = (url: string): string => {
  const parts = url.split('/');
  // path segment 4 (parts: scheme, '', host, seg0 …) becomes cover_x3
  if (parts.length > 7) parts[7] = 'cover_x3';
  return parts.join('/');
};

const idOf = (url: string) => /(\d+)(?:[?#].*)?$/.exec(url)?.[1] ?? url.replace(/^.*\//, '');
const summary = (id: string, title: string, thumb?: string | null): MangaSummary => ({
  url: `/web/product/${id}`,
  title,
  thumbnailUrl: thumb ? toCoverUrl(thumb) : undefined,
});

async function ranking(path: string): Promise<MangaPage> {
  const doc = await load(`${BASE_URL}/web/ranking/${path}`);
  return {
    items: doc
      .select('section.PCM-productRanking li > a')
      .map((a) =>
        summary(
          idOf(a.absUrl('href') ?? ''),
          a.selectFirst('.PCM-rankingProduct_title p')?.text() ?? '',
          a.selectFirst('img.js_lazy')?.absUrl('data-original'),
        ),
      ),
    hasNextPage: false,
  };
}

const stripTitle = (text: string, title: string | undefined) => (title ? text.replace(title, '').trim() : text);

export default defineExtension({
  preferences: () => [{ type: 'switch', key: HIDE_LOCKED, label: 'Hide Locked Chapters', default: false }],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: () => ranking('K/P/0'),
    async getLatest(page: number): Promise<MangaPage> {
      const doc = await load(`${BASE_URL}/web/weekday/product/list?page=${page}`);
      return {
        items: doc
          .select('li a:has(div.PCOM-prdList_info)')
          .map((a) =>
            summary(
              idOf(a.absUrl('href') ?? ''),
              a.selectFirst('.PCOM-prdList_title span')?.text() ?? '',
              a.selectFirst('img')?.absUrl('src'),
            ),
          ),
        hasNextPage: doc.selectFirst('#js_nextPage') !== null,
      };
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'ranking',
        label: 'ランキング',
        options: RANKINGS.map(([label, value]) => ({ label, value })),
        default: 'K/P/0',
      },
    ],
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (!query.trim()) return ranking(typeof filters.ranking === 'string' ? filters.ranking : 'K/P/0');
      const { body } = await http.get<{
        data: {
          products: {
            id: number;
            title: string;
            img?: string | null;
            is_audio?: number | null;
            is_anime?: number | null;
          }[];
          total_page: number;
        };
      }>(`${BASE_URL}/web/search/result_ajax/list?word=${encodeURIComponent(query)}&page=${page}&tab_type=T`, {
        headers: xHeaders,
        responseType: 'json',
      });
      return {
        items: body.data.products
          .filter((p) => p.is_audio !== 1 && p.is_anime !== 1)
          .map((p) => summary(String(p.id), p.title, p.img ? `https:${p.img}` : undefined)),
        hasNextPage: page < body.data.total_page,
      };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const doc = await load(BASE_URL + manga.url);
      const statusText = doc.selectFirst('ul.PCM-productStatus')?.text() ?? '';
      const status: MangaStatus = statusText.includes('連載中')
        ? 'ongoing'
        : statusText.includes('完結')
          ? 'completed'
          : 'unknown';
      const cover = doc.selectFirst('img.PCM-productThum_img')?.absUrl('src');
      return {
        url: manga.url,
        title: doc.selectFirst('h1.PCM-productTitle')?.text() ?? manga.title,
        author:
          doc
            .select('ul.PCM-productAuthor li a')
            .map((a) => a.text())
            .join(', ') || undefined,
        genres: doc.select('ul.PCM-productGenre li a, .PCM-productDesc_tagList li a').map((a) => a.text()),
        description: doc.selectFirst('div.PCM-productDesc > p')?.text(),
        thumbnailUrl: cover ? toCoverUrl(cover) : manga.thumbnailUrl,
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const hide = prefs.get<boolean>(HIDE_LOCKED) === true;
      const id = idOf(manga.url);
      const [episodesDoc, volumesDoc] = await Promise.all([
        load(`${BASE_URL}${manga.url}/episodes?etype=E`),
        load(`${BASE_URL}${manga.url}/episodes?etype=V`),
      ]);

      const volumes: Chapter[] = [];
      const volumeTitle = volumesDoc.selectFirst('.PCM-headTitle_name')?.text();
      for (const li of volumesDoc.selectFirst('ul#js_volumeList')?.select('li') ?? []) {
        const free = li.selectFirst('.PCM-prdVol_freeBtn');
        const buy = li.selectFirst('.PCM-prdVol_buyBtn');
        const trial = li.selectFirst('.PCM-prdVol_trialBtn');
        if (hide && !free && (buy || trial)) continue;
        const button = free ?? trial ?? buy ?? li.selectFirst('[data-episode_id]');
        if (!button) continue;
        const icon = free ? '' : trial ? '🔒 (Preview) ' : buy ? '🔒 ' : '';
        volumes.push({
          url: `${button.attr('data-product_id')}/${button.attr('data-episode_id')}`,
          name: icon + stripTitle(li.selectFirst('div.PCM-prdVol_title h2')?.text() ?? '', volumeTitle),
        });
      }

      const episodes: Chapter[] = [];
      const episodeTitle = episodesDoc.selectFirst('.PCM-headTitle_name')?.text();
      for (const li of episodesDoc.selectFirst('ul#js_episodeList')?.select('li') ?? []) {
        const link = li.selectFirst('a');
        if (!link) continue;
        const status = li.selectFirst('div.PCM-epList_status');
        const point = status?.selectFirst('.PCM-epList_status_point') != null;
        const wait =
          status?.selectFirst('.PCM-epList_status_waitfree') != null ||
          status?.selectFirst('.PCM-epList_status_zeroPlus') != null;
        if (hide && (point || wait)) continue;
        episodes.push({
          url: `${link.attr('data-product_id') || id}/${link.attr('data-episode_id')}`,
          name:
            (point ? '🔒 ' : wait ? '➡️ ' : '') +
            stripTitle(li.selectFirst('div.PCM-epList_title h2')?.text() ?? '', episodeTitle),
        });
      }
      return [...volumes, ...episodes].reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [productId, episodeId] = chapter.url.split('/');
      const response = await http.get(`${BASE_URL}/web/viewer/${productId}/${episodeId}`, { headers });
      const script = /var _pdata_\s*=([\s\S]*?)var _rcm_/.exec(response.body)?.[1];
      if (!script) throw new Error('Log in via Webview and purchase this product to read.');
      const json = script
        .trim()
        .replace(/;$/, '')
        .replace(/['"]?title['"]?\s*:\s*['"].*?['"],?/g, '')
        .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
        .replace(/'/g, '"')
        .replace(/,\s*([}\]])/g, '$1');
      const data = JSON.parse(json) as {
        img?: { path: string }[];
        contents?: { path: string }[];
        isScrambled: boolean;
      };
      const images = data.img ?? data.contents ?? [];
      const suffix = data.isScrambled ? '#scrambled' : '';
      return images.filter((i) => i.path).map((img, index) => ({ index, imageUrl: `https:${img.path}${suffix}` }));
    },
    imageHeaders: () => headers,
    /** Scrambled images: tiles of 50px are shuffled with a seeded generator, per tile size. */
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      const url = page.imageUrl ?? '';
      if (!url.endsWith('#scrambled')) return {};
      const size = imageSize(bytes);
      if (!size) return {};
      const [width, height] = size;
      const seed = extractSeed(url);
      const columns = Math.ceil(width / TILE_SIZE);
      const rows = Math.ceil(height / TILE_SIZE);
      const groups = new Map<string, { x: number; y: number }[]>();
      for (let index = 0; index < columns * rows; index++) {
        const x = (index % columns) * TILE_SIZE;
        const y = Math.floor(index / columns) * TILE_SIZE;
        const w = x + TILE_SIZE > width ? width - x : TILE_SIZE;
        const h = y + TILE_SIZE > height ? height - y : TILE_SIZE;
        const key = `${w}x${h}`;
        const group = groups.get(key);
        if (group) group.push({ x, y });
        else groups.set(key, [{ x, y }]);
      }
      const ops: TileOp[] = [];
      for (const [key, tiles] of groups) {
        const [w, h] = key.split('x').map(Number) as [number, number];
        const shuffled = new SeedRandom(seed).shuffle(tiles);
        tiles.forEach((dest, i) => ops.push({ sx: shuffled[i]!.x, sy: shuffled[i]!.y, w, h, dx: dest.x, dy: dest.y }));
      }
      return { tiles: { width, height, ops } };
    },
    resolveUrl(url: string): MangaSummary | null {
      const id = /\/web\/product\/(\d+)/.exec(url)?.[1];
      return hostOf(url) === hostOf(BASE_URL) && id ? { url: `/web/product/${id}`, title: '' } : null;
    },
    getWebUrl: (item) => ('name' in item ? `${BASE_URL}/web/viewer/${item.url}` : BASE_URL + item.url),
  }),
});
