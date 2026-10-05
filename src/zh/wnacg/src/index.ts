import {
  type Chapter,
  type Filter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { absoluteUrl, parseDate, relativeUrl } from './common/utils';

// The site moves to a new domain now and then (the old ones redirect): Tachiyomi keeps a list in its settings.
const BASE_URL = 'https://www.wn10.cfd';
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
  'Sec-Fetch-Mode': 'no-cors',
  'Sec-Fetch-Site': 'cross-site',
  Referer: `${BASE_URL}/`,
};

const TITLE_BLACKLIST: Preference = {
  type: 'text',
  key: 'titleBlacklist',
  label: '标题屏蔽关键词',
  description: '使用英文逗号或换行分隔多个关键词；忽略大小写，作用于热门和最新列表（以及搜索结果）。',
  default: '',
};
const FILTER_SEARCH: Preference = {
  type: 'switch',
  key: 'filterSearchResults',
  label: '在搜索结果中使用标题屏蔽',
  default: true,
};

const CATEGORIES: [string, string][] = [
  ['', ''],
  ['更新', 'albums-index-page-%d.html'],
  ['同人志', 'albums-index-page-%d-cate-5.html'],
  ['同人志-汉化', 'albums-index-page-%d-cate-1.html'],
  ['同人志-日语', 'albums-index-page-%d-cate-12.html'],
  ['同人志-English（英语）', 'albums-index-page-%d-cate-16.html'],
  ['同人志-CG书籍', 'albums-index-page-%d-cate-2.html'],
  ['写真&Cosplay', 'albums-index-page-%d-cate-3.html'],
  ['单行本', 'albums-index-page-%d-cate-6.html'],
  ['单行本-汉化', 'albums-index-page-%d-cate-9.html'],
  ['单行本-English（英语）', 'albums-index-page-%d-cate-17.html'],
  ['单行本-日语', 'albums-index-page-%d-cate-13.html'],
  ['杂志&短篇-汉语', 'albums-index-page-%d-cate-7.html'],
  ['杂志&短篇-汉语', 'albums-index-page-%d-cate-10.html'],
  ['杂志&短篇-日语', 'albums-index-page-%d-cate-14.html'],
  ['杂志&短篇-English（英语）', 'albums-index-page-%d-cate-18.html'],
  ['韩漫', 'albums-index-page-%d-cate-19.html'],
  ['韩漫-汉化', 'albums-index-page-%d-cate-20.html'],
  ['韩漫-生肉', 'albums-index-page-%d-cate-21.html'],
  ['3D&漫画', 'albums-index-page-%d-cate-22.html'],
  ['3D&漫画-汉语', 'albums-index-page-%d-cate-23.html'],
  ['3D&漫画-其他', 'albums-index-page-%d-cate-24.html'],
  ['AI图集', 'albums-index-page-%d-cate-37.html'],
  ['未分類相冊', 'albums-index-page-%d-cate-0.html'],
];

const blacklist = () =>
  (prefs.get<string>(TITLE_BLACKLIST.key) ?? '')
    .split(/[,\n\r]/)
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);

function filterBlocked(page: MangaPage, apply = true): MangaPage {
  const words = blacklist();
  if (!apply || words.length === 0) return page;
  return {
    items: page.items.filter((m) => !words.some((w) => m.title.toLowerCase().includes(w))),
    hasNextPage: page.hasNextPage,
  };
}

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function mangaListParse(document: HtmlElement): MangaPage {
  const items = document.select('.gallary_item').flatMap((element): MangaSummary[] => {
    const link = element.selectFirst('.title > a');
    if (!link) return [];
    const src = element.selectFirst('img')?.absUrl('src');
    return [
      {
        url: link.attr('href') ?? '',
        title: link.text(),
        thumbnailUrl: src ? src.replace(/^[^:]*:/, 'http:') : undefined,
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('span.thispage + a') != null };
}

const popularUrl = (page: number) => `/albums-favorite_ranking-page-${page}-type-week.html`;
const latestUrl = (page: number) => `/albums-index-page-${page}.html`;

export default defineExtension({
  preferences: () => [TITLE_BLACKLIST, FILTER_SEARCH],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => filterBlocked(mangaListParse(await load(popularUrl(page)))),
    getLatest: async (page) => filterBlocked(mangaListParse(await load(latestUrl(page)))),
    async search(query, page, filters): Promise<MangaPage> {
      const apply = prefs.get<boolean>(FILTER_SEARCH.key) !== false;
      let url: string;
      if (query.trim()) {
        url = `/search/index.php?s=create_time_DESC&q=${encodeURIComponent(query)}&p=${page}`;
      } else {
        const tag = typeof filters.tag === 'string' ? filters.tag.trim() : '';
        const category = typeof filters.category === 'string' ? filters.category : '';
        if (tag) url = `/albums-index-page-${page}-tag-${tag}.html`;
        else if (category) url = `/${category.replace('%d', String(page))}`;
        else url = popularUrl(page);
      }
      return filterBlocked(mangaListParse(await load(url)), apply);
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: '注意：分类和标签均不支持搜索' },
      {
        type: 'select',
        id: 'category',
        label: '分类',
        options: CATEGORIES.map(([label, value]) => ({ label, value })),
        default: '',
      },
      { type: 'separator' },
      { type: 'header', label: '注意：仅支持 1 个标签，不支持分类' },
      { type: 'text', id: 'tag', label: '标签' },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const author = document.selectFirst('div.uwuinfo p')?.text();
      const src = document.selectFirst('div.uwthumb img')?.attr('src');
      const statusText = document
        .select('div.uwconn label')
        .find((e) => e.text().includes('狀態'))
        ?.text();
      const tags = document.select('div.addtags a.tagshow').map((a) => a.text());
      return {
        url: manga.url,
        title: document.selectFirst('h2')?.text() || manga.title,
        thumbnailUrl: src ? `http:${src}` : manga.thumbnailUrl,
        author,
        artist: author,
        genres: tags.length ? tags : undefined,
        description:
          document
            .selectFirst('div.asTBcell p')
            ?.html()
            .replace(/<br\s*\/?>/g, '\n') || undefined,
        status: statusText?.includes('連載中') ? 'ongoing' : 'completed',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      const elements = document.select('div.sr_compact a.tagshow[data-chid]');
      if (elements.length === 0) return [{ url: manga.url, name: 'Ch. 1' }];
      return elements.map((element) => {
        const date = /\d{4}-\d{2}-\d{2}/.exec(element.attr('title') ?? '')?.[0];
        const time = parseDate(date, 'yyyy-MM-dd');
        return {
          url: `/photos-index-aid-${element.attr('data-chid')}.html`,
          name: element.text(),
          uploadedAt: time === undefined ? undefined : time - 8 * 3_600_000, // Asia/Taipei
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.get(absoluteUrl(BASE_URL, chapter.url.replace('-index-', '-gallery-')), { headers });
      const matches = [...response.body.matchAll(/\/\/[^\s"'\\]+\.(?:jpeg|jpg|png|webp|gif)(?:\?[^\s"'\\]*)?/gi)];
      return matches.map((match, index) => ({ index, imageUrl: `http:${match[0]}` }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)(\/photos-index-aid-\d+\.html)/i.exec(url.trim());
      if (!match) return null;
      return { url: relativeUrl(match[2]!), title: '' };
    },
  }),
});
