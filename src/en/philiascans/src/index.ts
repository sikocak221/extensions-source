import {
  type Chapter,
  type Filter,
  type FilterState,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type Preference,
  type TileOp,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf } from './common/utils';
import { chacha20, hmacSha256 } from './crypto';

const BASE_URL = 'https://philiascans.org';
const API_URL = `${BASE_URL}/api`;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const tokenHeaders = { ...headers, Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };

const HIDE_LOCKED_PREFERENCE: Preference = {
  type: 'switch',
  key: 'hide_locked',
  label: 'Hide chapters that require coins to read',
  default: false,
};

type Options = [string, string][];

const SORTS: Options = [
  ['Recently Updated', ''],
  ['Trending', 'trending'],
  ['Most Viewed', 'views'],
  ['Highest Rating', 'rating'],
  ['Alphabetical', 'title'],
  ['New Manga', 'added'],
];

const GROUPS: [string, string, Options][] = [
  [
    'types',
    'Types',
    [
      ['Manga', 'manga'],
      ['Manhwa', 'manhwa'],
      ['Manhua', 'manhua'],
      ['Webtoon', 'webtoon'],
      ['Comic', 'comic'],
    ],
  ],
  [
    'statuses',
    'Status',
    [
      ['On Going', 'on_going'],
      ['Completed', 'completed'],
      ['On Hold', 'on_hold'],
      ['Canceled', 'canceled'],
    ],
  ],
  [
    'genres',
    'Genre',
    [
      ['Action', 'action'],
      ['Adventure', 'adventure'],
      ['Comedy', 'comedy'],
      ['Drama', 'drama'],
      ['Ecchi', 'ecchi'],
      ['Fantasy', 'fantasy'],
      ['Gourmet', 'gourmet'],
      ['Harem', 'harem'],
      ['Historical', 'historical'],
      ['Isekai', 'isekai'],
      ['Josei', 'josei'],
      ['Magic', 'magic'],
      ['Martial Arts', 'martial-arts'],
      ['Monsters', 'monsters'],
      ['Music', 'music'],
      ['Mystery', 'mystery'],
      ['Psychological', 'psychological'],
      ['Regression', 'regression'],
      ['Romance', 'romance'],
      ['School Life', 'school-life'],
      ['Sci-Fi', 'sci-fi'],
      ['Seinen', 'seinen'],
      ['Shoujo', 'shoujo'],
      ['Shounen', 'shounen'],
      ['Slice of Life', 'slice-of-life'],
      ['Supernatural', 'supernatural'],
      ['Survival', 'survival'],
      ['Tragedy', 'tragedy'],
      ['Villainess', 'villainess'],
      ['War', 'war'],
    ],
  ],
];

interface Item {
  slug: string;
  title: string;
  coverImageUrl?: string | null;
}

interface Details extends Item {
  alternativeTitles?: string[] | null;
  synopsis?: string | null;
  status?: string | null;
  genres?: { name: string }[] | null;
  authors?: { name: string }[] | null;
  artists?: { name: string }[] | null;
}

interface ChapterItem {
  number: string;
  title?: string | null;
  slug: string;
  publishedAt?: string | null;
  coinPrice?: number | null;
  purchased?: boolean | null;
}

async function getJson<T>(url: string, extra: Record<string, string> = headers): Promise<T> {
  const response = await http.request<string>({ url, headers: extra });
  if (response.status === 429) throw new Error('Rate limited by Philia Scans. Wait a moment and try again.');
  if (response.status === 401) throw new Error('Log in via WebView to renew access.');
  if (response.status !== 200) throw new Error(`HTTP ${response.status} for ${url}`);
  return JSON.parse(response.body) as T;
}

const absolute = (url: string | null | undefined) =>
  url ? (url.startsWith('http') ? url : `${BASE_URL}/${url.replace(/^\/+/, '')}`) : undefined;

const toSummary = (i: Item): MangaSummary => ({
  url: `/series/${i.slug}`,
  title: i.title,
  thumbnailUrl: absolute(i.coverImageUrl),
});

const isLocked = (c: ChapterItem) => c.purchased === false && c.coinPrice !== 0;

async function browse(page: number, query: string, filters: FilterState): Promise<MangaPage> {
  const params = [`page=${page}`, 'perPage=20'];
  if (query.trim()) params.push(`q=${encodeURIComponent(query.trim())}`);
  const orderby = typeof filters.orderby === 'string' ? filters.orderby : '';
  if (orderby) params.push(`orderby=${orderby}`);
  params.push(`order=${typeof filters.order === 'string' ? filters.order : 'desc'}`);
  for (const [group, , options] of GROUPS)
    for (const [, value] of options) if (filters[`${group}.${value}`] === true) params.push(`${group}=${value}`);
  const result = await getJson<{ items: Item[]; page: number; totalPages: number }>(
    `${API_URL}/manga?${params.join('&')}`,
  );
  return { items: result.items.map(toSummary), hasNextPage: result.page < result.totalPages };
}

async function readerToken(): Promise<string> {
  const cached = await storage.get<{ token: string; expiresAt: number }>('reader_token');
  if (cached && cached.expiresAt * 1000 - Date.now() > 60_000) return cached.token;
  const response = await http.request<string>({
    url: `${API_URL}/reader/access-token`,
    method: 'POST',
    headers: tokenHeaders,
  });
  if (response.status === 429) throw new Error('Rate limited by Philia Scans. Wait a moment and try again.');
  if (response.status !== 200) throw new Error(`Failed to get reader access token (HTTP ${response.status}).`);
  const result = JSON.parse(response.body) as { token: string; expiresAt: number };
  await storage.set('reader_token', result);
  return result.token;
}

// ---- Page decryption ----

const AES_MAGIC = 0x02;
const CHACHA_MAGIC = 0x03;
const AES4_MAGIC = 0x04;

function aesCtr(data: Uint8Array, key: Uint8Array): Uint8Array {
  return crypto.aesDecrypt(data, key, { mode: 'ctr', iv: new Uint8Array(16), padding: false });
}

async function xorKeystream(data: Uint8Array, key: Uint8Array, pageIndex: number): Promise<Uint8Array> {
  const out = new Uint8Array(data.length);
  for (let block = 0, offset = 0; offset < data.length; block++, offset += 32) {
    const hash = hmacSha256(key, `page:${pageIndex}:${block}`);
    const end = Math.min(32, data.length - offset);
    for (let i = 0; i < end; i++) out[offset + i] = data[offset + i]! ^ hash[i]!;
    if (block % 2000 === 1999) await timers.sleep(0);
  }
  return out;
}

/** Width and height of a PNG, JPEG or WebP file. */
function imageSize(bytes: Uint8Array): [number, number] | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return [view.getUint32(16), view.getUint32(20)];
  if (bytes[0] === 0x52 && bytes[8] === 0x57) {
    const chunk = String.fromCharCode(...bytes.subarray(12, 16));
    if (chunk === 'VP8 ') return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
    if (chunk === 'VP8L') {
      const bits = view.getUint32(21, true);
      return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
    }
    if (chunk === 'VP8X')
      return [
        1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)),
        1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)),
      ];
  }
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

/** Undoes the keyed Fisher–Yates shuffle of a `gridSize`² tile grid. */
function unscrambleTiles(
  key: Uint8Array,
  pageIndex: number,
  gridSize: number,
  scrambled: [number, number],
  original: [number, number],
): TileOp[] {
  const count = gridSize * gridSize;
  const order = Array.from({ length: count }, (_, i) => i);
  if (count >= 2) {
    const tilesKey = hmacSha256(key, `tiles:${pageIndex}`);
    let counter = 0;
    let buffer: DataView = new DataView(new ArrayBuffer(32));
    let index = 8;
    const next = () => {
      if (index >= 8) {
        const digest = hmacSha256(tilesKey, `perm:${counter++}`);
        buffer = new DataView(digest.buffer, digest.byteOffset, 32);
        index = 0;
      }
      return buffer.getUint32(index++ * 4, true);
    };
    for (let i = count - 1; i >= 1; i--) {
      const j = next() % (i + 1);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
  }
  const source = new Array<number>(count);
  for (let i = 0; i < count; i++) source[order[i]!] = i;
  const tileWidth = Math.floor(scrambled[0] / gridSize);
  const tileHeight = Math.floor(scrambled[1] / gridSize);
  const ops: TileOp[] = [];
  for (let t = 0; t < count; t++) {
    const s = source[t]!;
    const dx = (t % gridSize) * tileWidth;
    const dy = Math.floor(t / gridSize) * tileHeight;
    if (dx >= original[0] || dy >= original[1]) continue;
    ops.push({
      sx: (s % gridSize) * tileWidth,
      sy: Math.floor(s / gridSize) * tileHeight,
      w: Math.min(tileWidth, original[0] - dx),
      h: Math.min(tileHeight, original[1] - dy),
      dx,
      dy,
    });
  }
  return ops;
}

export default defineExtension({
  preferences: () => [HIDE_LOCKED_PREFERENCE],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => browse(page, '', { orderby: 'views' }),
    getLatest: (page) => browse(page, '', {}),
    search: (query, page, filters) => browse(page, query, filters),
    getFilters: (): Filter[] => [
      { type: 'header', label: 'Note: Search and active filters are applied together' },
      {
        type: 'select',
        id: 'orderby',
        label: 'Sort by',
        options: SORTS.map(([l, v]) => ({ label: l, value: v })),
        default: '',
      },
      {
        type: 'select',
        id: 'order',
        label: 'Order by',
        options: [
          { label: 'Descending', value: 'desc' },
          { label: 'Ascending', value: 'asc' },
        ],
        default: 'desc',
      },
      ...GROUPS.map(([id, label, options]): Filter => ({
        type: 'group',
        id,
        label,
        filters: options.map(([l, v]) => ({ type: 'checkbox', id: `${id}.${v}`, label: l })),
      })),
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const slug = manga.url.split('/')[2] ?? '';
      const d = await getJson<Details>(`${API_URL}/manga/${slug}`);
      const alt = d.alternativeTitles?.length
        ? `Alternative Titles:\n${d.alternativeTitles.map((t) => `- ${t}`).join('\n')}`
        : '';
      const status = d.status?.toLowerCase();
      return {
        url: manga.url,
        title: d.title,
        thumbnailUrl: absolute(d.coverImageUrl) ?? manga.thumbnailUrl,
        description: [d.synopsis ?? '', alt].filter(Boolean).join('\n\n') || undefined,
        author: d.authors?.map((a) => a.name).join(', ') || undefined,
        artist: d.artists?.map((a) => a.name).join(', ') || undefined,
        genres: d.genres?.map((g) => g.name) ?? [],
        status: status === 'on_going' ? 'ongoing' : status === 'completed' ? 'completed' : 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const slug = manga.url.split('/')[2] ?? '';
      const hideLocked = prefs.get<boolean>(HIDE_LOCKED_PREFERENCE.key) ?? false;
      const { items } = await getJson<{ items: ChapterItem[] }>(`${API_URL}/manga/${slug}/chapters`);
      return items
        .filter((c) => !hideLocked || !isLocked(c))
        .map((c) => {
          const title = c.title && c.title.trim() && c.title !== 'null' && c.title !== c.number ? c.title : null;
          const date = c.publishedAt ? Date.parse(c.publishedAt) : NaN;
          return {
            url: `/series/${slug}/${c.slug}`,
            name: `${isLocked(c) ? '🔒 ' : ''}Chapter ${c.number}${title ? ` - ${title}` : ''}`,
            number: Number.parseFloat(c.number),
            uploadedAt: Number.isNaN(date) ? undefined : date,
          };
        });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [, , mangaSlug, chapterSlug] = chapter.url.split('/');
      const viewer = await getJson<{
        hasAccess: boolean;
        chapter: { id: number; scrambled: boolean; pages: { position: number; url: string; mime: string }[] };
      }>(`${API_URL}/manga/${mangaSlug}/chapters/${chapterSlug}`);
      if (!viewer.hasAccess) throw new Error('Log in via WebView and purchase this chapter to read.');
      const id = viewer.chapter.id;
      let token = await readerToken();
      let keysResponse = await http.request<string>({
        url: `${API_URL}/chapters/${id}/page-keys`,
        headers: { ...tokenHeaders, 'X-Reader-Access-Token': token },
      });
      if (keysResponse.status === 404) {
        await storage.remove('reader_token');
        token = await readerToken();
        keysResponse = await http.request<string>({
          url: `${API_URL}/chapters/${id}/page-keys`,
          headers: { ...tokenHeaders, 'X-Reader-Access-Token': token },
        });
      }
      if (keysResponse.status !== 200) throw new Error(`Failed to get page keys (HTTP ${keysResponse.status}).`);
      const keys = JSON.parse(keysResponse.body) as {
        chapterKeyB64: string;
        gridSize: number;
        sessionDefault?: boolean;
      };
      const readerHeaders = { ...tokenHeaders, 'X-Reader-Access-Token': token };
      let payloadA: string | null = null;
      let payloadB: string | null = null;
      if (keys.sessionDefault) {
        const open = JSON.parse(
          (
            await http.request<string>({
              url: `${API_URL}/chapters/${id}/open`,
              method: 'POST',
              headers: readerHeaders,
            })
          ).body,
        ) as { sessionId: string; payloadA?: string | null };
        payloadA = open.payloadA ?? null;
        const drm = await http.request<string>({
          url: `${API_URL}/chapters/${id}/get-drm?session=${encodeURIComponent(open.sessionId)}`,
          headers: readerHeaders,
        });
        if (drm.status === 200) payloadB = (JSON.parse(drm.body) as { payloadB?: string | null }).payloadB ?? null;
      }
      const scrambled = viewer.chapter.scrambled ? '1' : '0';
      return [...viewer.chapter.pages]
        .sort((a, b) => a.position - b.position)
        .map((p, index) => ({
          index,
          imageUrl: `${absolute(p.url)}#${[scrambled, p.mime, keys.chapterKeyB64, keys.gridSize, payloadA, payloadB, index].join(';')}`,
        }));
    },
    imageHeaders: () => headers,
    async transformImage(page: Page, bytes: Uint8Array): Promise<ImageTransform> {
      const url = page.imageUrl ?? '';
      const path = url.split('#')[0]!.split('?')[0]!;
      if (!/_s\.[^./]+$/.test(path)) return {};
      const [scrambled, , keyB64, grid, payloadA, payloadB, index] = (url.split('#')[1] ?? '').split(';');
      const pageIndex = Number(index);
      let key: Uint8Array;
      if (payloadA && payloadA !== 'null' && payloadB && payloadB !== 'null') {
        const a = base64.decodeBytes(payloadA);
        const b = base64.decodeBytes(payloadB);
        key = new Uint8Array(32).map((_, i) => a[i]! ^ b[i]!);
      } else key = base64.decodeBytes(keyB64 ?? '');
      const magic = bytes[0] === 0xff ? bytes[1] : undefined;
      const start = magic === AES_MAGIC || magic === CHACHA_MAGIC || magic === AES4_MAGIC ? 2 : 0;
      const view = new DataView(bytes.buffer, bytes.byteOffset + start, 4);
      const original: [number, number] = [view.getUint16(0), view.getUint16(2)];
      const body = bytes.subarray(start + 4);
      let plain: Uint8Array;
      if (magic === AES4_MAGIC) plain = aesCtr(body, hmacSha256(key, `aesctr4:${pageIndex}`));
      else if (magic === CHACHA_MAGIC) plain = await chacha20(body, hmacSha256(key, `cc:${pageIndex}`));
      else if (magic === AES_MAGIC) plain = aesCtr(body, hmacSha256(key, `aesctr:${pageIndex}`));
      else plain = await xorKeystream(body, key, pageIndex);
      if (scrambled !== '1' || magic === CHACHA_MAGIC || magic === AES4_MAGIC) return { bytes: plain };
      const size = imageSize(plain);
      if (!size) return { bytes: plain };
      return {
        bytes: plain,
        tiles: {
          width: original[0],
          height: original[1],
          ops: unscrambleTiles(key, pageIndex, Number(grid), size, original),
        },
      };
    },
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/series\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/series/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
