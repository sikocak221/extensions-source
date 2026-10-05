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
import { USER_AGENT, absoluteUrl, hostOf, ownText } from './common/utils';

const BASE_URL = 'https://nnhanman.xyz';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const GENRES: [string, string][] = [
  ['全部', 'all'],
  ['正妹', '正妹'],
  ['恋爱', '恋爱'],
  ['出版漫画', '出版漫画'],
  ['肉慾', '肉慾'],
  ['浪漫', '浪漫'],
  ['大尺度', '大尺度'],
  ['巨乳', '巨乳'],
  ['有夫之婦', '有夫之婦'],
  ['女大生', '女大生'],
  ['狗血劇', '狗血劇'],
  ['同居', '同居'],
  ['好友', '好友'],
  ['調教', '調教'],
  ['动作', '动作'],
  ['後宮', '後宮'],
  ['不倫', '不倫'],
  ['3D', '3D'],
  ['校園', '校園'],
  ['耽美', '耽美'],
  ['日漫', '日漫'],
];
const ORDERS: [string, string][] = [
  ['按时间', 'time'],
  ['按热度', 'hits'],
];
const STATUSES: [string, string][] = [
  ['全部', 'all'],
  ['已完结', 'completed'],
  ['连载中', 'serialized'],
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

// Cards shared by the home, category and search pages: ul.col_3_1 > li
function cardFromElement(element: HtmlElement): MangaSummary[] {
  const link = element.selectFirst('a.ImgA') ?? element.selectFirst('a[href^="/comic/"]');
  if (!link) return [];
  return [
    {
      url: link.attr('href') ?? '',
      title: link.attr('title') || element.selectFirst('a.txtA')?.text() || element.text(),
      thumbnailUrl:
        element.selectFirst('source[srcset]')?.attr('srcset') ||
        element.selectFirst('img[src]')?.attr('src') ||
        undefined,
    },
  ];
}

// Cards of the update and ranking pages.
function parseItemBoxes(document: HtmlElement): MangaPage {
  const items = document.select('div.itemBox').flatMap((box): MangaSummary[] => {
    const link = box.selectFirst('a.title');
    if (!link) return [];
    return [
      {
        url: link.attr('href') ?? '',
        title: link.attr('title') || link.text(),
        thumbnailUrl: box.selectFirst('img[src]')?.attr('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: false };
}

function parseCol3Cards(document: HtmlElement): MangaPage {
  const seen = new Set<string>();
  const items = document
    .select('ul.col_3_1 > li')
    .flatMap(cardFromElement)
    .filter((m) => !seen.has(m.url) && seen.add(m.url));
  // The pagination ends with a "... 147" item for the last page.
  const last = document.selectFirst('div.pagination-wrap li:last-child a');
  return { items, hasNextPage: last?.text().startsWith('...') === true };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async () => parseItemBoxes(await load('/ranking')),
    getLatest: async () => parseItemBoxes(await load('/update')),
    async search(query, page, filters): Promise<MangaPage> {
      const keyword = query.trim();
      const suffix = page > 1 ? `/page/${page}` : '';
      if (keyword) return parseCol3Cards(await load(`/search/${encodeURIComponent(keyword)}${suffix}`));
      const value = (id: string, fallback: string) =>
        typeof filters[id] === 'string' && filters[id] ? (filters[id] as string) : fallback;
      const genre = value('genre', 'all');
      return parseCol3Cards(
        await load(
          `/comics/${encodeURIComponent(genre)}/ob/${value('order', 'time')}/st/${value('status', 'all')}${suffix}`,
        ),
      );
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: '分类浏览（搜索时无效）' },
      {
        type: 'select',
        id: 'genre',
        label: '分类',
        options: GENRES.map(([label, value]) => ({ label, value })),
        default: 'all',
      },
      {
        type: 'select',
        id: 'order',
        label: '排序',
        options: ORDERS.map(([label, value]) => ({ label, value })),
        default: 'time',
      },
      {
        type: 'select',
        id: 'status',
        label: '状态',
        options: STATUSES.map(([label, value]) => ({ label, value })),
        default: 'all',
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const statusText = document.selectFirst('span.date')?.text() ?? '';
      const status: MangaStatus = statusText.includes('连载中')
        ? 'ongoing'
        : statusText.includes('已完结')
          ? 'completed'
          : 'unknown';
      const author = document
        .select('div.sub_r > p.txtItme')
        .find((p) => !p.selectFirst('a[href^="/comics/"]') && !p.selectFirst('span.date'));
      return {
        url: manga.url,
        title: document.selectFirst('h1')?.text().replace(/^《/, '').replace(/》$/, '') || manga.title,
        thumbnailUrl: document.selectFirst('div.pic img')?.attr('src') || manga.thumbnailUrl,
        author: ownText(author) || undefined,
        genres: document.select('p.txtItme a[href^="/comics/"]').map((a) => a.text()),
        status,
        description:
          document
            .selectFirst('p.txtDesc')
            ?.text()
            .replace(/^介绍:/, '')
            .trim() || undefined,
      };
    },
    // The page lists the chapters newest first.
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      const links = document.select('#mh-chapter-list-ol-0 li a');
      return links.map((a, index): Chapter => ({
        url: a.attr('href') ?? '',
        name: a.selectFirst('span')?.text() || a.text(),
        number: links.length - index,
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      return document
        .select('#m_r_imgbox_0 img[data-src]')
        .map((img) => ({
          order: Number.parseInt(img.attr('data-index') ?? '', 10) || 0,
          url: img.absUrl('data-src') ?? '',
        }))
        .sort((a, b) => a.order - b.order)
        .map((page, index) => ({ index, imageUrl: page.url }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)(\/comic\/[^?#]+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase().replace(/^www\./, '') !== hostOf(BASE_URL).replace(/^www\./, ''))
        return null;
      return { url: match[2]!, title: '' };
    },
  }),
});
