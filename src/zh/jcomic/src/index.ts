import {
  type Chapter,
  type Filter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf } from './common/utils';

const BASE_URL = 'https://jcomic.net';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, Cookie: 'jcomic_access=verified_user' };

const CATEGORIES = [
  '全彩',
  '長篇',
  '單行本',
  '同人',
  '短篇',
  'Cosplay',
  '歐美',
  'WEBTOON',
  '圓神領域',
  '碧藍幻想',
  'CG雜圖',
  '英語 ENG',
  '生肉',
  '純愛',
  '百合花園',
  '耽美花園',
  '偽娘哲學',
  '後宮閃光',
  '扶他樂園',
  '姐姐系',
  '妹妹系',
  'SM',
  '性轉換',
  '足の恋',
  '重口地帶',
  '人妻',
  'NTR',
  '強暴',
  '非人類',
  '艦隊收藏',
  'Love Live',
  'SAO 刀劍神域',
  'Fate',
  '東方',
  '禁書目錄',
];
const SEARCH_TYPES: [string, string][] = [
  ['默认', 'search'],
  ['作者', 'author'],
];

async function load(path: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, encodeURI(decodeURI(path))), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

// Titles end with the page count: "Name (34)".
function parseList(document: HtmlElement): MangaPage {
  const items = document.select('.container .col-lg-4').flatMap((element): MangaSummary[] => {
    const link = element.selectFirst('a');
    if (!link) return [];
    const name = element.selectFirst('.comic-title')?.text() ?? '';
    return [
      {
        url: link.attr('href') ?? '',
        title: name.replace(/\(\d+\)/g, '').trim(),
        thumbnailUrl: link.selectFirst('img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('.pagination > li.active:not(:last-child)') != null };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => parseList(await load(`/cat/隨機/${page}`)),
    getLatest: async (page) => parseList(await load(`/cat/最近更新/${page}`)),
    async search(query, page, filters): Promise<MangaPage> {
      if (query.trim()) {
        const type = typeof filters.type === 'string' && filters.type ? filters.type : 'search';
        return parseList(await load(`/${type}/${query.trim()}/${page}`));
      }
      const category = typeof filters.category === 'string' && filters.category ? filters.category : CATEGORIES[0]!;
      return parseList(await load(`/cat/${category}/${page}`));
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'type',
        label: '搜索类型',
        options: SEARCH_TYPES.map(([label, value]) => ({ label, value })),
        default: 'search',
      },
      {
        type: 'select',
        id: 'category',
        label: '分类（搜索关键字时无效）',
        options: CATEGORIES.map((value) => ({ label: value, value })),
        default: CATEGORIES[0],
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url.replace('/page', '/eps'));
      return {
        url: manga.url,
        title: manga.title,
        thumbnailUrl: document.selectFirst('.col-md-6:nth-child(1) img')?.absUrl('src') || manga.thumbnailUrl,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      if (manga.url.includes('/page')) return [{ url: manga.url, name: '单章节' }];
      const document = await load(manga.url);
      return document
        .select('.col-md-6:nth-child(2) a')
        .map((a) => ({ url: a.attr('href') ?? '', name: a.text() }))
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      return document.select('.comic-thumb').map((img, index) => {
        const locked = img.attr('data-locked');
        const imageUrl = locked
          ? base64.decode([...locked.replace(/^JCOMIC_TRAP_/, '')].reverse().join(''))
          : img.attr('data-src') || img.attr('src') || '';
        return { index, imageUrl };
      });
    },
    // The image links expire after a minute.
    imageHeaders: () => headers,
    getWebUrl: (item) => absoluteUrl(BASE_URL, encodeURI(decodeURI(item.url))),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)(\/(?:page|eps)\/[^?#]+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase() !== hostOf(BASE_URL)) return null;
      return { url: decodeURIComponent(match[2]!), title: '' };
    },
  }),
});
