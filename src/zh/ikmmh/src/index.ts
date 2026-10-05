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
import { absoluteUrl, hostOf, parseDate } from './common/utils';

const BASE_URL = 'https://ymcdnyfqdapp.ikmmh.com';
// The site only answers mobile user agents, and its WAF dislikes requests that don't look like a browser's.
const headers: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  Referer: `${BASE_URL}/`,
};
const PAGE_SIZE = 48;
const LATEST_MAX_PAGES = 7;
const MAX_PAGES = 1000;

const AREAS: [string, string][] = [
  ['9', '全部'],
  ['1', '日漫'],
  ['4', '国漫'],
  ['5', '韩漫'],
  ['6', '未分类'],
];
const TAGS = [
  '全部',
  '长条',
  '大女主',
  '百合',
  '耽美',
  '纯爱',
  '後宫',
  '韩漫',
  '奇幻',
  '轻小说',
  '生活',
  '悬疑',
  '格斗',
  '搞笑',
  '伪娘',
  '竞技',
  '职场',
  '萌系',
  '冒险',
  '治愈',
  '都市',
  '霸总',
  '神鬼',
  '侦探',
  '爱情',
  '古风',
  '欢乐向',
  '科幻',
  '穿越',
  '性转换',
  '校园',
  '美食',
  '剧情',
  '热血',
  '节操',
  '励志',
  '异世界',
  '历史',
  '战争',
  '恐怖',
];

// The site hands a new PHPSESSID to every cookie-less request: send the same session back.
let sessionCookie = '';

async function request<T = string>(
  url: string,
  options: { form?: Record<string, string> } = {},
): Promise<{ body: T; url: string }> {
  const requestHeaders = sessionCookie ? { ...headers, Cookie: sessionCookie } : headers;
  const response = options.form
    ? await http.post<T>(url, { form: options.form }, { headers: requestHeaders })
    : await http.get<T>(url, { headers: requestHeaders });
  const setCookie = Object.entries(response.headers).find(([name]) => name.toLowerCase() === 'set-cookie')?.[1] ?? '';
  const session = /PHPSESSID=[^;,\s]+/.exec(setCookie)?.[0];
  if (session) sessionCookie = session;
  return { body: response.body, url: response.url };
}

async function warmup(): Promise<void> {
  if (!sessionCookie) await request(`${BASE_URL}/`).catch(() => undefined);
}

async function load(url: string): Promise<HtmlElement> {
  await warmup();
  const { body, url: finalUrl } = await request(url);
  return html.load(body, { baseUrl: finalUrl });
}

function parseListItems(document: HtmlElement): MangaSummary[] {
  return document.select('li.item.comic-item').flatMap((item): MangaSummary[] => {
    const link = item.selectFirst('a[href]');
    if (!link) return [];
    return [
      {
        url: link.attr('href') ?? '',
        title: item.selectFirst('p.title')?.text() || (link.attr('title') ?? '').split(',')[0]!,
        thumbnailUrl: item.selectFirst('img.img')?.absUrl('src') || undefined,
      },
    ];
  });
}

const hasNextPage = (document: HtmlElement) => document.select('li.item.comic-item').length === PAGE_SIZE;

function parseDetails(document: HtmlElement, manga: MangaSummary): MangaDetails {
  const meta = (property: string) => document.selectFirst(`meta[property="${property}"]`)?.attr('content');
  const author = meta('og:cartoon:author')?.replace(/\\,/g, ',');
  const statusText = meta('og:cartoon:status')?.trim();
  const status: MangaStatus = statusText === '完结' ? 'completed' : statusText === '连载' ? 'ongoing' : 'unknown';
  return {
    url: manga.url,
    title: meta('og:title') ?? manga.title,
    thumbnailUrl: meta('og:image') ?? manga.thumbnailUrl,
    description: meta('og:description'),
    genres: meta('og:cartoon:category')
      ?.split(/[,，]/)
      .map((g) => g.trim())
      .filter(Boolean),
    author,
    artist: author,
    status,
  };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(page): Promise<MangaPage> {
      const document = await load(`${BASE_URL}/booklists/9/${encodeURIComponent('全部')}/3/${page}.html`);
      return { items: parseListItems(document), hasNextPage: hasNextPage(document) };
    },
    async getLatest(page): Promise<MangaPage> {
      const document = await load(`${BASE_URL}/update/${page}.html`);
      return { items: parseListItems(document), hasNextPage: page < LATEST_MAX_PAGES };
    },
    async search(query, page, filters): Promise<MangaPage> {
      if (query.trim()) {
        // The site's search has no pagination.
        const document = await load(`${BASE_URL}/search?searchkey=${encodeURIComponent(query)}`);
        return { items: parseListItems(document), hasNextPage: false };
      }
      const area = typeof filters.area === 'string' && filters.area ? filters.area : '9';
      const tag = typeof filters.tag === 'string' && filters.tag ? filters.tag : '全部';
      const status = filters.status === 'include' ? '1' : filters.status === 'exclude' ? '4' : '3';
      const document = await load(`${BASE_URL}/booklists/${area}/${encodeURIComponent(tag)}/${status}/${page}.html`);
      return { items: parseListItems(document), hasNextPage: hasNextPage(document) };
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: '分类/题材/状态筛选（应用于分类浏览）' },
      {
        type: 'select',
        id: 'area',
        label: '地区',
        options: AREAS.map(([value, label]) => ({ label, value })),
        default: '9',
      },
      { type: 'select', id: 'tag', label: '题材', options: TAGS.map((t) => ({ label: t, value: t })), default: '全部' },
      { type: 'tristate', id: 'status', label: '状态（包含=连载中，排除=已完结）' },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      return parseDetails(await load(absoluteUrl(BASE_URL, manga.url)), manga);
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      await warmup();
      const bookId = manga.url.trim().replace(/\/+$/, '').split('/').pop();
      const { body } = await request(
        `${BASE_URL}/api/comic/zyz/chapters?ph=1&tempid=3&zpid=${bookId}&page=0&line=48&orderby=desc`,
      );
      const list = JSON.parse(body.replace(/\\,/g, ',')) as {
        length?: { url: string; name: string; stime?: string | null }[];
      };
      const chapters = list.length ?? [];
      // The list is newest first; numbers count from the oldest.
      return chapters.map((dto, index) => ({
        url: dto.url,
        name: dto.name,
        number: chapters.length - index,
        uploadedAt: parseDate(dto.stime, 'yyyy/MM/dd'),
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      // chapter.url looks like /chapter/71097/2332470.html
      const parts = chapter.url.replace(/^\/+|\/+$/g, '').split('/');
      if (parts.length !== 3 || parts[0] !== 'chapter') throw new Error(`Unexpected chapter URL: ${chapter.url}`);
      const aid = parts[1]!;
      const cid = parts[2]!.split('.')[0]!;
      await warmup();
      const urls: string[] = [];
      let offset = 0;
      while (urls.length < MAX_PAGES) {
        const { body } = await request<{ data?: { pic?: { pic: string }[]; total?: number } }>(
          `${BASE_URL}/api/comic/read/pics`,
          { form: { id: cid, aid, offset: String(offset), limit: '10' } },
        );
        const data =
          typeof body === 'string'
            ? (JSON.parse(body) as { data?: { pic?: { pic: string }[]; total?: number } }).data
            : body.data;
        const batch = data?.pic ?? [];
        if (batch.length === 0) break;
        urls.push(...batch.map((p) => p.pic));
        offset += batch.length;
        if ((data?.total ?? 0) > 0 && offset >= (data?.total ?? 0)) break;
      }
      return urls.map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)(\/book\/[^?#]+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase() !== hostOf(BASE_URL)) return null;
      return { url: match[2]!, title: '' };
    },
  }),
});
