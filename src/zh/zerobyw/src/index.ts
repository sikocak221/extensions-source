import {
  type Chapter,
  type Filter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { absoluteUrl, hostOf, relativeUrl } from './common/utils';

const DEFAULT_BASE_URL = 'http://www.zerobyw33.com';
const LATEST_DOMAIN_URL = 'https://stevenyomi.github.io/source-domains/zerobyw.txt';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0';
const headers = { 'User-Agent': USER_AGENT };

// [query key, label, [value, label][]]
const FILTERS: [string, string, [string, string][]][] = [
  [
    'category_id',
    '分类',
    [
      ['', '全部'],
      ['1', '卖肉'],
      ['15', '战斗'],
      ['32', '日常'],
      ['6', '后宫'],
      ['13', '搞笑'],
      ['28', '日常'],
      ['31', '爱情'],
      ['22', '冒险'],
      ['23', '奇幻'],
      ['26', '战斗'],
      ['29', '体育'],
      ['34', '机战'],
      ['35', '职业'],
      ['36', '汉化组跟上，不再更新'],
    ],
  ],
  [
    'jindu',
    '进度',
    [
      ['', '全部'],
      ['0', '连载中'],
      ['1', '已完结'],
    ],
  ],
  [
    'shuxing',
    '性质',
    [
      ['', '全部'],
      ['一半中文一半生肉', '一半中文一半生肉'],
      ['全生肉', '全生肉'],
      ['全中文', '全中文'],
    ],
  ],
];

const COMMENT = /【\d+/;

// The site changes domain now and then: when the current one fails, the latest is read from a text file.
let baseUrl = DEFAULT_BASE_URL;

async function fetchBody(path: string): Promise<{ body: string; url: string }> {
  const attempt = async (base: string) => {
    const response = await http.request<string>({ url: `${base}${path}`, headers });
    if (response.status >= 200 && response.status < 300) return response;
    throw new Error(`HTTP ${response.status}`);
  };
  try {
    const response = await attempt(baseUrl);
    return { body: response.body, url: response.url };
  } catch (error) {
    let latest: string;
    try {
      latest = (await http.get(LATEST_DOMAIN_URL, { headers })).body.trim();
    } catch {
      throw error;
    }
    if (!latest || latest === baseUrl) throw error;
    baseUrl = latest;
    const response = await attempt(baseUrl);
    return { body: response.body, url: response.url };
  }
}

async function load(path: string): Promise<{ document: HtmlElement; url: string }> {
  const { body, url } = await fetchBody(path);
  return { document: html.load(body, { baseUrl: url }), url };
}

const getTitle = (title: string) => {
  const match = COMMENT.exec(title);
  return match ? title.slice(0, match.index) : title.split('【')[0]!;
};

async function fetchMangaList(path: string): Promise<MangaPage> {
  const { document } = await load(path);
  const items = document.select('a[href*="/details/?kuid="]').map((element): MangaSummary => ({
    title: getTitle(element.selectFirst('h3')?.text() ?? ''),
    url: relativeUrl(element.absUrl('href') || element.attr('href') || ''),
    thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined,
  }));
  return { items, hasNextPage: document.select('a').some((a) => a.text().includes('下一页')) };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: DEFAULT_BASE_URL,
    // The site has no popular list; this is its latest.
    getPopular: (page) => fetchMangaList(`/pc/pc/?page=${page}`),
    async search(query, page, filters): Promise<MangaPage> {
      const params: [string, string][] = [];
      if (query.trim()) params.push(['keyword', query]);
      else
        for (const [key] of FILTERS) {
          const value = filters[key];
          if (typeof value === 'string' && value) params.push([key, value]);
        }
      params.push(['page', String(page)]);
      return fetchMangaList(`/pc/pc/?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`);
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: '如果使用文本搜索' },
      { type: 'header', label: '过滤器将被忽略' },
      ...FILTERS.map(([key, label, options]): Filter => ({
        type: 'select',
        id: key,
        label,
        options: options.map(([value, l]) => ({ label: l, value })),
        default: '',
      })),
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(manga.url);
      const labs = document.select('main div.flex-wrap.text-sm > span').map((s) => s.text());
      const status: MangaStatus = labs.includes('连载中')
        ? 'ongoing'
        : labs.includes('已完结')
          ? 'completed'
          : 'unknown';
      return {
        url: manga.url,
        title: getTitle(document.selectFirst('main h1')?.text() ?? manga.title),
        thumbnailUrl: document.selectFirst('main img.object-contain')?.absUrl('src') || manga.thumbnailUrl,
        author: labs[0]?.replace(/^作者: /, ''),
        genres: labs,
        description:
          document
            .selectFirst('p[x-ref=summaryText]')
            ?.html()
            .replace(/<br\s*\/?>/g, '')
            .trim() || undefined,
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { document } = await load(manga.url);
      return document
        .select('div.grid a[href*="/view/index.php"]')
        .map((element) => ({
          url: relativeUrl(element.absUrl('href') || element.attr('href') || ''),
          name: element.text(),
        }))
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document } = await load(chapter.url);
      const images = document.select('#image-container img.manga-image');
      if (images.length === 0) {
        const message = document.select('div#messagetext > p');
        const text = (message.length ? message : document.select('main + div p')).map((p) => p.text()).join(' ');
        if (text) throw new Error(text);
      }
      return images.map((img, index) => ({ index, imageUrl: img.absUrl('src') ?? '' }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => absoluteUrl(baseUrl, item.url),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)(\/(?:pc\/)?details\/\?kuid=[^&#]+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase() !== hostOf(baseUrl)) return null;
      return { url: match[2]!, title: '' };
    },
  }),
});
