import {
  type Chapter,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type TileOp,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, parseDate, relativeUrl } from './common/utils';
import { SeedRandom } from './seedrandom';

const BASE_URL = 'https://novema.jp';
const JST = 9 * 3600_000;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

type Doc = ReturnType<typeof html.load>;
async function load(url: string) {
  const res = await http.get(url, { headers });
  return html.load(res.body, { baseUrl: res.url });
}

function parseList(doc: Doc): MangaPage {
  const items: MangaSummary[] = [];
  for (const el of doc.select('ul.comicList > li')) {
    const a = el.selectFirst('a');
    if (!a) continue;
    items.push({
      url: relativeUrl(a.absUrl('href') ?? ''),
      title: el
        .select('dl > dt > p.line-clamp.n2')
        .map((p) => p.text())
        .join(' ')
        .trim(),
      thumbnailUrl: el.selectFirst('img')?.absUrl('data-src'),
    });
  }
  return { items, hasNextPage: doc.selectFirst('.pageList li.next') != null };
}

interface Slice {
  x: number;
  y: number;
  w: number;
  h: number;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    imageHeaders: () => headers,
    async getPopular(page) {
      return parseList(await load(`${BASE_URL}/comic/serial/${page}`));
    },
    async search(query: string, page: number): Promise<MangaPage> {
      return parseList(await load(`${BASE_URL}/comic/search/${page}?type=0&word=${encodeURIComponent(query)}`));
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const doc = await load(absoluteUrl(BASE_URL, manga.url));
      return {
        url: manga.url,
        title: doc.selectFirst('.comicTit')?.text().trim() ?? manga.title,
        description: doc.selectFirst('.comicStory .txtAcd_text_inner')?.text().trim(),
        author:
          doc
            .select('.credit li')
            .map((l) => l.text().trim())
            .join(', ') || undefined,
        genres: doc.select('.topCategoryTag ul li a').map((a) => a.text().trim().replace(/^#/, '')),
        thumbnailUrl: doc.selectFirst('.serialMainImage')?.absUrl('src') ?? manga.thumbnailUrl,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const doc = await load(absoluteUrl(BASE_URL, manga.url));
      const chapters: Chapter[] = [];
      for (const a of doc.select('.comicSerialList article a')) {
        const href = a.absUrl('href');
        if (!href) continue;
        const date = parseDate(a.selectFirst('.update')?.text().replace(' 更新', '').trim(), 'yyyy/MM/dd');
        chapters.push({
          url: relativeUrl(href),
          name: a.selectFirst('.storyTitle')?.text().trim() ?? '',
          uploadedAt: date === undefined ? undefined : date - JST,
        });
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const doc = await load(absoluteUrl(BASE_URL, chapter.url));
      const script = doc.selectFirst('#comic-data')?.html();
      if (!script) throw new Error('Comic data not found');
      const data = JSON.parse(script) as { serial_comic_id: number; story_number: number };
      const content = `${BASE_URL}/img/serial-comic/${data.serial_comic_id}/${data.story_number}/content`;
      const index = (
        await http.get<{ name: string; seed: string; size: number }[]>(`${content}/index.json`, {
          headers,
          responseType: 'json',
        })
      ).body;
      return index.map((p, i) => ({
        index: i,
        imageUrl: `${content}/${p.name}?seed=${encodeURIComponent(p.seed)}&size=${p.size}`,
      }));
    },
    async transformImage(page: Page, bytes: Uint8Array): Promise<ImageTransform> {
      const url = page.imageUrl ?? '';
      const seed = /[?&]seed=([^&]*)/.exec(url)?.[1];
      const size = /[?&]size=(\d+)/.exec(url)?.[1];
      if (!seed || !size) return {};
      const dims = imageSize(bytes);
      if (!dims) return {};
      const [width, height] = dims;
      const seedText = decodeURIComponent(seed);
      const sliceSize = Math.max(width, height) / Number(size);
      const verticalSlices = Math.ceil(width / sliceSize);
      const total = verticalSlices * Math.ceil(height / sliceSize);
      const groups = new Map<string, Slice[]>();
      for (let i = 0; i < total; i++) {
        const row = Math.floor(i / verticalSlices);
        const col = i - row * verticalSlices;
        const x = Math.trunc(col * sliceSize);
        const y = Math.trunc(row * sliceSize);
        const w = x + sliceSize <= width ? Math.trunc(sliceSize) : width - x;
        const h = y + sliceSize <= height ? Math.trunc(sliceSize) : height - y;
        const key = `${w}-${h}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push({ x, y, w, h });
      }
      const ops: TileOp[] = [];
      for (const group of groups.values()) {
        const rng = new SeedRandom(seedText);
        const shuffled = rng.shuffle(group.map((_, i) => i));
        let cols = group.length;
        if (group.length === 1) cols = 1;
        else {
          for (let i = 0; i < group.length; i++) {
            if (group[i]!.y !== group[0]!.y) {
              cols = i;
              break;
            }
          }
        }
        for (let i = 0; i < group.length; i++) {
          const dest = group[i]!;
          const s = shuffled[i]!;
          ops.push({
            sx: group[0]!.x + (s % cols) * dest.w,
            sy: group[0]!.y + Math.floor(s / cols) * dest.h,
            w: dest.w,
            h: dest.h,
            dx: dest.x,
            dy: dest.y,
          });
        }
      }
      return { tiles: { width, height, ops } };
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});

/** Width and height of a JPEG, PNG or WebP file. */
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
  return undefined;
}
