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
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://www.jjmhw2.top';
// A desktop user agent keeps the site from serving the mobile layout.
const headers = {
  'User-Agent': USER_AGENT.replace('Chrome/134.0.0.0', 'Chrome/140.0.0.0'),
  Referer: `${BASE_URL}/`,
};

const GENRES = [
  '全部',
  '青春',
  '性感',
  '长腿',
  '多人',
  '御姐',
  '巨乳',
  '新婚',
  '媳妇',
  '暧昧',
  '清纯',
  '调教',
  '少妇',
  '风骚',
  '同居',
  '淫乱',
  '好友',
  '女神',
  '诱惑',
  '偷情',
  '出轨',
  '正妹',
  '家教',
];
const AREAS: [string, string][] = [
  ['全部', '-1'],
  ['韩国', '1'],
  ['日本', '2'],
  ['台湾', '3'],
];
const STATUSES: [string, string][] = [
  ['全部', '-1'],
  ['连载', '0'],
  ['完结', '1'],
];

async function load(path: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, path), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function parseThumbnail(element: HtmlElement): string | undefined {
  const style = element.selectFirst('.mh-cover')?.attr('style') ?? '';
  if (!style.includes('url(')) return undefined;
  return style
    .slice(style.indexOf('url(') + 4)
    .split(')')[0]!
    .replace(/^["']|["']$/g, '');
}

function parseManga(element: HtmlElement, titleSelector: string): MangaSummary[] {
  const link = element.selectFirst(titleSelector);
  if (!link) return [];
  return [
    {
      url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
      title: link.text(),
      thumbnailUrl: parseThumbnail(element),
    },
  ];
}

async function mangaList(path: string): Promise<MangaPage> {
  const document = await load(path);
  return {
    items: document.select('.mh-item').flatMap((e) => parseManga(e, '.title a')),
    hasNextPage: document.selectFirst('a#nextPage') != null,
  };
}

const parseStatus = (status: string | undefined): MangaStatus =>
  status?.includes('连载') ? 'ongoing' : status?.includes('完结') ? 'completed' : 'unknown';

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const document = await load('/rank');
      const section = selectIgnoreCase(document, '.mh-list.col3.top-cat > li').find((li) =>
        li.select('.title').some((t) => t.text().includes('人气榜')),
      );
      const items = (section?.select('.mh-item, .mh-itme-top') ?? []).flatMap((e) => parseManga(e, 'h2.title a'));
      return { items, hasNextPage: false };
    },
    getLatest: (page) => mangaList(`/update?page=${page}`),
    async search(query, page, filters): Promise<MangaPage> {
      if (query.trim()) return mangaList(`/search?keyword=${encodeURIComponent(query)}`);
      const value = (id: string, fallback: string) =>
        typeof filters[id] === 'string' ? (filters[id] as string) : fallback;
      return mangaList(
        `/booklist?page=${page}&tag=${encodeURIComponent(value('genre', '全部'))}&area=${value('area', '-1')}&end=${value('status', '-1')}`,
      );
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: '注意：搜索时不支持分类过滤' },
      { type: 'separator' },
      {
        type: 'select',
        id: 'genre',
        label: '题材',
        options: GENRES.map((v) => ({ label: v, value: v })),
        default: '全部',
      },
      {
        type: 'select',
        id: 'area',
        label: '地区',
        options: AREAS.map(([label, value]) => ({ label, value })),
        default: '-1',
      },
      {
        type: 'select',
        id: 'status',
        label: '进度',
        options: STATUSES.map(([label, value]) => ({ label, value })),
        default: '-1',
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const info = document.selectFirst('.banner_detail_form .info');
      const field = (label: string) =>
        selectIgnoreCase(info ?? document, '.tip span.block').find((e) => e.text().includes(label));
      return {
        url: manga.url,
        title: info?.selectFirst('h1')?.text() || manga.title,
        author:
          selectIgnoreCase(info ?? document, '.subtitle')
            .find((e) => e.text().includes('作者'))
            ?.text()
            .split('：')
            .slice(1)
            .join('：')
            .trim() || undefined,
        status: parseStatus(field('状态')?.selectFirst('span')?.text()),
        genres: (field('标签')?.select('a') ?? []).map((a) => a.text()),
        description: info?.selectFirst('.content')?.text() || undefined,
        thumbnailUrl: document.selectFirst('.banner_detail_form .cover img')?.absUrl('src') || manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      const updated = selectIgnoreCase(document, '.tip span.block')
        .find((e) => e.text().includes('更新时间'))
        ?.text()
        .split('：')
        .slice(1)
        .join('：')
        .trim();
      const date = parseDate(updated, 'yyyy-MM-dd');
      const chapters = document
        .select('#detail-list-select li a')
        .map((element): Chapter => ({
          name: element.text(),
          url: relativeUrl(element.absUrl('href') || element.attr('href') || ''),
        }))
        .reverse();
      if (chapters[0] && date !== undefined) chapters[0].uploadedAt = date - 8 * 3_600_000; // Asia/Shanghai
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      return document
        .select('.comicpage img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('data-original') || img.absUrl('src') || '' }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)(\/book\/\d+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase() !== hostOf(BASE_URL)) return null;
      return { url: match[2]!, title: '' };
    },
  }),
});
