import {
  type Chapter,
  type Filter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { absoluteUrl } from './common/utils';

const BASE_URL = 'https://www.zazhimi.net';
const API_URL = 'https://android2026.zazhimi.net/api';
const headers = { 'User-Agent': 'ZaZhiMi_6.0.0' };

const TYPES: [string, string][] = [
  ['女装服饰', '6'],
  ['美妆美发', '8'],
  ['时尚男士', '9'],
  ['娱乐明星', '10'],
  ['手工制作', '127'],
  ['居家生活', '168'],
];

const BRANDS: [string, string][] = [
  ['全部', ''],
  ['BeasUp', '36'],
  ['美的', '48'],
  ['VoCE', '51'],
  ['MAQUIA', '53'],
  ['nail venus', '65'],
  ['ageha', '84'],
  ['NAIL MAX', '109'],
  ['Nail Up', '121'],
  ['ar', '149'],
  ['TOMOTOMO', '155'],
  ['CHOKiCHOKi', '178'],
  ['springヘア&ビューティー', '214'],
  ['美ST', '357'],
  ['LDK the Beauty', '361'],
  ['preppy', '386'],
  ['Nail Ex', '395'],
  ['HAIR MODE', '400'],
  ['其他美容美甲画册', '349'],
];

interface ShowItem {
  magId: string;
  magName: string;
  magPic: string;
}

async function api<T>(path: string): Promise<T> {
  return (await http.get<T>(`${API_URL}${path}`, { headers, responseType: 'json' })).body;
}

const authorOf = (name: string) => name.split(' ')[0] ?? '';

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(page): Promise<MangaPage> {
      const result = await api<{ new: { magId: string; magName: string; magCover: string }[] }>(
        `/index.php?p=${page}&s=20`,
      );
      const items = result.new.map((item) => ({
        url: `/show.php?a=${item.magId}`,
        title: item.magName,
        thumbnailUrl: item.magCover,
      }));
      return { items, hasNextPage: items.length > 0 };
    },
    async search(query, page, filters): Promise<MangaPage> {
      const type = typeof filters.type === 'string' && filters.type ? filters.type : TYPES[0]![1];
      const brand = typeof filters.brand === 'string' ? filters.brand : '';
      const path = query
        ? `/search.php?k=${encodeURIComponent(query)}&p=${page}&s=20`
        : `/lists.php?c=${type}&m=${brand}&p=${page}&s=20`;
      const result = await api<{ magazine: { magId: string; magName: string; magCover?: string; magDate?: string }[] }>(
        path,
      );
      const items = result.magazine.map((item) => ({
        url: `/show.php?a=${item.magId}`,
        title: item.magName,
        // search results have no cover, magDate is the image folder of the first page
        thumbnailUrl:
          item.magCover ?? (item.magDate ? `https://img2020.zazhimi.net/aazzmpic-l/${item.magDate}001.jpg` : undefined),
      }));
      return { items, hasNextPage: true };
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: '筛选条件（搜索关键字时无效）' },
      {
        type: 'select',
        id: 'type',
        label: '分类',
        options: TYPES.map(([label, value]) => ({ label, value })),
        default: TYPES[0]![1],
      },
      {
        type: 'select',
        id: 'brand',
        label: '品牌',
        options: BRANDS.map(([label, value]) => ({ label, value })),
        default: '',
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const result = await api<{ content: ShowItem[] }>(manga.url);
      const item = result.content[0];
      if (!item) throw new Error('内容解析为空！');
      return {
        url: `/show.php?a=${item.magId}`,
        title: item.magName,
        author: authorOf(item.magName),
        thumbnailUrl: item.magPic,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      return [{ url: manga.url, name: '全本', number: 1 }];
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const result = await api<{ content: ShowItem[] }>(chapter.url);
      return result.content.map((item, index) => ({ index, imageUrl: item.magPic }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
