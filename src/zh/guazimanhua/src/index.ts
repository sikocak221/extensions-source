import {
  type Chapter,
  type Filter,
  type FilterOption,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { absoluteUrl, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://www.guazimanhua.com';
// The site serves a "download our app" page (no images) for the latest chapter when it detects an Android
// mobile browser UA; a desktop UA returns the actual pages.
const headers = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Referer: `${BASE_URL}/`,
};

const option = ([label, value]: [string, string]): FilterOption => ({ label, value });

const GENRES: [string, string][] = [
  ['全部', '0'],
  ['耽美', '41'],
  ['恋爱', '9'],
  ['校园', '29'],
  ['霸总', '5'],
  ['都市', '42'],
  ['穿越', '8'],
  ['古风', '23'],
  ['玄幻', '25'],
  ['奇幻', '31'],
  ['科幻', '22'],
  ['灵异', '21'],
  ['动作', '54'],
  ['悬疑', '11'],
  ['冒险', '30'],
  ['搞笑', '15'],
  ['热血', '13'],
  ['恐怖', '14'],
  ['系统', '148'],
  ['逆袭', '97'],
  ['脑洞', '55'],
  ['复仇', '61'],
  ['真人', '17'],
  ['其它', '27'],
];
const REGIONS: [string, string][] = [
  ['全部', '0'],
  ['大陆', '42'],
  ['欧美', '43'],
  ['港台', '77'],
  ['日韩', '78'],
  ['国漫', '338'],
];
const AUDIENCES: [string, string][] = [
  ['全部', '0'],
  ['男频', '1'],
  ['女频', '2'],
];
const STATUSES: [string, string][] = [
  ['全部', '0'],
  ['连载中', '2'],
  ['已完结', '1'],
];
const SORTS: [string, string][] = [
  ['今日热门', 'daily'],
  ['人气', 'hits'],
  ['更新', 'update'],
  ['评分', 'score'],
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function parseMangaList(document: HtmlElement): MangaPage {
  const items = document.select('article.card').flatMap((element): MangaSummary[] => {
    const cover = element.selectFirst('a.cover-wrap');
    if (!cover) return [];
    return [
      {
        url: relativeUrl(cover.absUrl('href') || cover.attr('href') || ''),
        title: element.selectFirst('h3 a')?.text() ?? '',
        thumbnailUrl: element.selectFirst('img.cover')?.attr('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.select('nav.pager a').some((a) => a.text() === '>') };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => parseMangaList(await load(`${BASE_URL}/category.php?sort=hits&page=${page}`)),
    getLatest: async (page) => parseMangaList(await load(`${BASE_URL}/category.php?sort=update&page=${page}`)),
    async search(query, page, filters): Promise<MangaPage> {
      const params: [string, string][] = [];
      if (query) params.push(['keyword', query]);
      const value = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');
      for (const [id, param] of [
        ['genre', 'cid'],
        ['region', 'city'],
        ['audience', 'audience'],
        ['status', 'is_end'],
      ] as const)
        if (value(id) && value(id) !== '0') params.push([param, value(id)]);
      params.push(['sort', value('sort') || 'hits'], ['page', String(page)]);
      const qs = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
      return parseMangaList(await load(`${BASE_URL}/category.php?${qs}`));
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: '筛选条件（应用后需重新搜索）' },
      { type: 'select', id: 'genre', label: '分类', options: GENRES.map(option), default: '0' },
      { type: 'select', id: 'region', label: '地区', options: REGIONS.map(option), default: '0' },
      { type: 'select', id: 'audience', label: '受众', options: AUDIENCES.map(option), default: '0' },
      { type: 'select', id: 'status', label: '进度', options: STATUSES.map(option), default: '0' },
      { type: 'select', id: 'sort', label: '排序', options: SORTS.map(option), default: 'hits' },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      const meta = document.selectFirst('p.mobile-comic-meta')?.text() ?? '';
      const status: MangaStatus = meta.includes('完结') ? 'completed' : meta.includes('连载') ? 'ongoing' : 'unknown';
      const author = document
        .select('div.cinema-strip > div')
        .find((e) => e.selectFirst('span')?.text() === '作者')
        ?.selectFirst('b')
        ?.text();
      const tags = document.selectFirst('p.mobile-comic-tags')?.text();
      return {
        url: manga.url,
        title: document.selectFirst('div.mobile-comic-title')?.text() || manga.title,
        thumbnailUrl: document.selectFirst('img.mobile-comic-cover')?.absUrl('src') || manga.thumbnailUrl,
        description: document.selectFirst('p.mobile-comic-desc')?.text() || undefined,
        genres: tags ? tags.split(/[\s,，、/]+/).filter(Boolean) : undefined,
        author: author || undefined,
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      return document.select('section.mobile-comic-all-chapters div.mobile-chapter-grid a').map((element) => ({
        url: relativeUrl(element.absUrl('href') || element.attr('href') || ''),
        name: element.text(),
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(absoluteUrl(BASE_URL, chapter.url));
      return document
        .select('section.reader-images img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.attr('src') || '' }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)(\/comic\.php[^#]*)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase() !== hostOf(BASE_URL)) return null;
      return { url: match[2]!, title: '' };
    },
  }),
});
