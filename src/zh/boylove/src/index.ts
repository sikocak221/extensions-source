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
  type TileOp,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, parseDate } from './common/utils';
import { imageSize } from './image';

const BASE_URL = 'https://boylove.cc';
const IMAGE_HOST = 'https://blcnimghost2.cc';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const STATUSES: [string, string][] = [
  ['全部', '2'],
  ['连载中', '0'],
  ['已完结', '1'],
];
const TYPES: [string, string][] = [
  ['全部', '0'],
  ['清水', '1'],
  ['有肉', '2'],
];
const REGIONS: [string, string][] = [
  ['全部', '0'],
  ['日漫', '日漫'],
  ['韩漫', '韩漫'],
  ['国漫', '国漫'],
  ['台漫', '台漫'],
];
const VIPS: [string, string][] = [
  ['全部', '2'],
  ['非会员可观看', '0'],
  ['VIP 漫画', '1'],
];

const toImageUrl = (url: string) => (url.startsWith('http') ? url : `${IMAGE_HOST}${url}`);
const idOf = (url: string) => url.replace(/^\/+/, '');

interface MangaDto {
  id: number;
  title: string;
  update_time?: string | number | null;
  image: string;
  auther: string;
  desc?: string | null;
  mhstatus: number;
  keyword: string;
}

function toDetails(dto: MangaDto): MangaDetails {
  const status: MangaStatus = dto.mhstatus === 0 ? 'ongoing' : dto.mhstatus === 1 ? 'completed' : 'unknown';
  let description = dto.desc?.trim();
  if (dto.update_time !== undefined && dto.update_time !== null) {
    const time =
      typeof dto.update_time === 'string'
        ? dto.update_time
        : new Date(dto.update_time * 1000).toISOString().replace('T', ' ').slice(0, 19);
    description = `更新时间：${time}\n\n${dto.desc?.trim() ?? ''}`;
  }
  return {
    url: `/${dto.id}`,
    title: dto.title,
    author: dto.auther,
    genres: dto.keyword
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean),
    status,
    thumbnailUrl: toImageUrl(dto.image),
    description,
  };
}

const summary = (dto: MangaDto): MangaSummary => ({
  url: `/${dto.id}`,
  title: dto.title,
  thumbnailUrl: toImageUrl(dto.image),
});

async function api<T>(path: string): Promise<T> {
  return (await http.get<T>(`${BASE_URL}${path}`, { headers, responseType: 'json' })).body;
}

async function parseMangaPage(path: string): Promise<MangaPage> {
  const { result } = await api<{ result: { lastPage: boolean; list?: MangaDto[] } }>(path);
  return { items: (result.list ?? []).map(summary), hasNextPage: !result.lastPage };
}

const textSearchUrl = (page: number, query: string) =>
  `/home/api/searchk?keyword=${encodeURIComponent(query)}&type=1&pageNo=${page}`;

function buildFilterPath(page: number, filters: Record<string, unknown>): string {
  const value = (id: string, fallback: string) =>
    typeof filters[id] === 'string' && filters[id] ? (filters[id] as string) : fallback;
  const status = value('status', '2');
  const type = value('type', '0');
  const region = value('region', '0');
  const genre = value('genre', '0');
  const vip = value('vip', '2');
  const tags =
    region === '0' && genre === '0' ? '0' : region === '0' ? genre : genre === '0' ? region : `${region}+${genre}`;
  return `1-${tags}-${status}-1-${page}-${type}-1-${vip}`;
}

function partsCount(document: HtmlElement): number | undefined {
  const script = document
    .select('script')
    .map((s) => s.html())
    .find((text) => text.includes('firstMergeImg') && text.includes('imageData'));
  if (!script) return undefined;
  const part = script
    .split('var scrollTop')[0]!
    .split('var randomClass = ')
    .pop()!
    .split(';')[0]!
    .trim()
    .split(' ')
    .pop()!;
  const count = Number.parseInt(part, 10);
  return Number.isNaN(count) ? undefined : count;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => parseMangaPage(`/home/api/getpage/tp/1-topestmh-${page - 1}`),
    async getLatest(page): Promise<MangaPage> {
      const { result } = await api<{ result: MangaDto[] }>(
        `/home/Api/getDailyUpdate.html?widx=4&page=${page - 1}&limit=10`,
      );
      return { items: result.map(summary), hasNextPage: result.length >= 10 };
    },
    async search(query, page, filters): Promise<MangaPage> {
      if (query.trim()) return parseMangaPage(textSearchUrl(page, query));
      return parseMangaPage(`/home/api/cate/tp/${buildFilterPath(page, filters)}`);
    },
    async getFilters(): Promise<Filter[]> {
      const select = (id: string, label: string, options: [string, string][]): Filter => ({
        type: 'select',
        id,
        label,
        options: options.map(([l, value]) => ({ label: l, value })),
        default: options[0]![1],
      });
      const filters: Filter[] = [
        { type: 'header', label: '分类筛选（搜索文本时无效）' },
        select('status', '状态', STATUSES),
        select('type', '类型', TYPES),
        select('region', '地区', REGIONS),
      ];
      try {
        const response = await http.get(`${BASE_URL}/home/book/cate.html`, { headers });
        const genres = html
          .load(response.body, { baseUrl: response.url })
          .select('div[data-str=tag] > a.button')
          .map((a) => a.text().trim())
          .filter(Boolean);
        if (genres.length)
          filters.push(select('genre', '标签', [['全部', '0'], ...genres.map((g): [string, string] => [g, g])]));
      } catch (error) {
        log.warn('Cannot load tags', error);
      }
      filters.push(
        { type: 'header', label: '若要观看VIP漫画，请先在Webview中登录网站，并确认您的账户已达到Lv3' },
        select('vip', '漫画权限', VIPS),
      );
      return filters;
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const id = Number.parseInt(idOf(manga.url), 10);
      const { result } = await api<{ result: { list?: MangaDto[] } }>(textSearchUrl(1, manga.title));
      const found = result.list?.find((m) => m.id === id);
      if (!found) throw new Error('Manga not found');
      return toDetails(found);
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { result } = await api<{ result: { list?: { id: number; title: string; create_time: string }[] } }>(
        `/home/api/chapter_list/tp/${idOf(manga.url)}`,
      );
      return (result.list ?? [])
        .map((c) => ({
          url: `/home/book/capter/id/${c.id}`,
          name: c.title.trim(),
          uploadedAt: parseDate(c.create_time, 'yyyy-MM-dd HH:mm:ss'),
        }))
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.get(absoluteUrl(BASE_URL, chapter.url), { headers });
      const document = html.load(response.body, { baseUrl: response.url });
      const root = document.selectFirst('section');
      if (!root) throw new Error('Reader not found');
      const images = root.select('.reader-cartoon-image');
      const urls =
        images.length === 0
          ? root
              .select('img')
              .map((img) => toImageUrl((img.attr('src') ?? '').trim()))
              .filter((url) => !url.endsWith('.gif'))
          : images
              .map((box) => box.selectFirst('img'))
              .filter((img) => img && (img.attr('src') ?? '').endsWith('load.png'))
              .map((img) => toImageUrl((img!.attr('data-original') ?? '').trim()));
      // Scrambled pages carry the number of strips in the url fragment (it is not sent to the site).
      const parts = partsCount(document);
      return urls.map((url, index) => ({ index, imageUrl: parts === undefined ? url : `${url}#parts=${parts}` }));
    },
    imageHeaders: () => headers,
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      const parts = Number.parseInt(/#parts=(\d+)/.exec(page.imageUrl ?? '')?.[1] ?? '', 10);
      const size = imageSize(bytes);
      if (Number.isNaN(parts) || !size) return {};
      const [width, height] = size;
      const ops: TileOp[] = [];
      for (let part = 1; part <= parts; part++) {
        if (height >= 4000) {
          const strip = Math.floor(width / parts);
          const x = strip * (part - 1);
          ops.push({ sx: x, sy: 0, w: strip, h: height, dx: x, dy: 0 });
        } else if (part === parts) {
          const strip = width - Math.floor(width / parts) * (parts - 1);
          ops.push({ sx: 0, sy: 0, w: strip, h: height, dx: width - strip, dy: 0 });
        } else {
          const strip = Math.floor(width / parts);
          ops.push({ sx: width - strip * part, sy: 0, w: strip, h: height, dx: strip * (part - 1), dy: 0 });
        }
      }
      return { tiles: { width, height, ops } };
    },
    getWebUrl: (item) =>
      item.url.startsWith('/home/')
        ? absoluteUrl(BASE_URL, item.url)
        : `${BASE_URL}/home/book/index/id/${idOf(item.url)}`,
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)\/home\/book\/index\/id\/(\d+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase() !== hostOf(BASE_URL)) return null;
      return { url: `/${match[2]}`, title: '' };
    },
  }),
});
