import {
  type Chapter,
  type Filter,
  type HtmlElement,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl } from './common/utils';
import { imageSize } from './image';
import { md5Bytes } from './md5';

const BASE_URL = 'https://rouman5.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string): Promise<{ document: HtmlElement; body: string; url: string }> {
  const response = await http.get(url, { headers });
  return { document: html.load(response.body, { baseUrl: response.url }), body: response.body, url: response.url };
}

function parseEntries(container: HtmlElement): MangaSummary[] {
  return container.select('a.site-comic').map((a) => ({
    url: a.attr('href') ?? '',
    title: a.selectFirst('h3')?.text() ?? '',
    thumbnailUrl: a.selectFirst('img')?.absUrl('src') || undefined,
  }));
}

// The pager reads "1 / 103"; on the last page "下一頁" is a disabled button.
function hasNextPage(document: HtmlElement): boolean {
  const parts = (document.selectFirst('.site-pagination-mobile')?.text() ?? '').split('/');
  const current = Number.parseInt(parts[0]?.trim() ?? '', 10);
  const total = Number.parseInt(parts[1]?.trim() ?? '', 10);
  return !Number.isNaN(current) && !Number.isNaN(total) && current < total;
}

async function parseMangaList(url: string): Promise<MangaPage> {
  const { document } = await load(url);
  return { items: parseEntries(document), hasNextPage: hasNextPage(document) };
}

/** Pages whose url has "sr:1" come with their blocks in reverse order. */
function scrambledBlocks(imageUrl: string): number | undefined {
  const path = imageUrl.split(/[?#]/)[0]!.split('/');
  if (!path.includes('sr:1')) return undefined;
  const name = path[path.length - 1]!.replace(/\.[^.]+$/, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const bytes = base64.decodeBytes(name.padEnd(name.length + ((4 - (name.length % 4)) % 4), '='));
  const digest = md5Bytes([...bytes]);
  return ((digest[digest.length - 1]! & 0xff) % 10) + 5;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => parseMangaList(`${BASE_URL}/books?page=${page - 1}`),
    async getLatest(): Promise<MangaPage> {
      const { document } = await load(`${BASE_URL}/home`);
      const seen = new Set<string>();
      const items = (document.selectFirst('div.site-home')?.select(':scope > *') ?? [])
        .filter((section) => /最近更新/.test(section.selectFirst('.site-section-heading')?.text() ?? ''))
        .flatMap(parseEntries)
        .filter((m) => !seen.has(m.url) && seen.add(m.url));
      return { items, hasNextPage: false };
    },
    async search(query, page, filters): Promise<MangaPage> {
      if (query.trim()) return parseMangaList(`${BASE_URL}/search?term=${encodeURIComponent(query)}&page=${page - 1}`);
      const status = typeof filters.status === 'string' ? filters.status : '';
      return parseMangaList(`${BASE_URL}/books?page=${page - 1}${status ? `&continued=${status}` : ''}`);
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: '提示：搜尋時篩選無效' },
      {
        type: 'select',
        id: 'status',
        label: '狀態',
        options: [
          { label: '全部', value: '' },
          { label: '連載中', value: 'true' },
          { label: '已完結', value: 'false' },
        ],
        default: '',
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document, url } = await load(absoluteUrl(BASE_URL, manga.url));
      const info = document.selectFirst('div.site-book-info');
      const title = info?.selectFirst('h1')?.text() ?? manga.title;
      const alias = info?.selectFirst('p.site-book-alias')?.text();
      const synopsis = document.selectFirst('div.site-book-synopsis')?.text() ?? '';
      const data = new Map<string, string>();
      const dts = info?.select('dl.site-book-data dt') ?? [];
      const dds = info?.select('dl.site-book-data dd') ?? [];
      dts.forEach((dt, index) => data.set(dt.text(), dds[index]?.text() ?? ''));
      const statusText = data.get('狀態') ?? '';
      const status: MangaStatus = statusText.startsWith('連載中')
        ? 'ongoing'
        : statusText.startsWith('已完結')
          ? 'completed'
          : 'unknown';
      const genres: string[] = [];
      const region = data.get('地區');
      if (region) genres.push(region);
      const eyebrow = info?.selectFirst('p.site-eyebrow')?.text().split('/')[0]?.trim();
      if (eyebrow) genres.push(eyebrow);
      return {
        url: relativeUrl(url),
        title,
        thumbnailUrl: document.selectFirst('img.site-detail-cover')?.absUrl('src') || manga.thumbnailUrl,
        description: `${alias && alias !== title ? `別名: ${alias}\n\n` : ''}${synopsis}`,
        author: data.get('作者') || undefined,
        status,
        genres,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { document } = await load(absoluteUrl(BASE_URL, manga.url));
      const chapters = document
        .select('a.site-chapter-link')
        .map((a): Chapter => ({ url: a.attr('href') ?? '', name: a.selectFirst('span')?.attr('title') ?? a.text() }))
        .reverse();
      const dts = document.select('dl.site-book-data dt');
      const dds = document.select('dl.site-book-data dd');
      const updated = dds[dts.findIndex((dt) => dt.text().includes('更新'))]?.text();
      const date = parseDate(updated, 'M/d/yyyy');
      if (chapters[0] && date !== undefined) chapters[0].uploadedAt = date - 8 * 3_600_000; // Asia/Taipei
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { body } = await load(absoluteUrl(BASE_URL, chapter.url));
      // TanStack hydration: imagePaths:$R[n]=["https://...", ...]
      const marker = body.indexOf('imagePaths:');
      const start = marker >= 0 ? body.indexOf('=[', marker) + 1 : -1;
      const end = start > 0 ? body.indexOf(']', start) : -1;
      if (end < 0) return [];
      const urls = JSON.parse(body.slice(start, end + 1)) as string[];
      return urls.map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      const blocks = scrambledBlocks(page.imageUrl ?? '');
      const size = imageSize(bytes);
      if (!blocks || !size) return {};
      const [width, height] = size;
      const blockHeight = Math.floor(height / blocks);
      let iy = blockHeight * (blocks - 1);
      let cy = 0;
      const ops = [];
      // Scrambled images are reversed by blocks; the remainder is in the bottom (scrambled) block.
      for (let i = 0; i < blocks; i++) {
        const h = i === 0 ? height - iy : blockHeight;
        ops.push({ sx: 0, sy: iy, w: width, h, dx: 0, dy: cy });
        iy -= blockHeight;
        cy += h;
      }
      return { tiles: { width, height, ops } };
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)(\/books\/[^/?#]+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase() !== hostOf(BASE_URL)) return null;
      return { url: match[2]!, title: '' };
    },
  }),
});
