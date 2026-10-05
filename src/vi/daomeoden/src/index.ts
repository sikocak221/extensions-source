import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://daomeoden.net';
const LIST_PATH = '/danh-sach-truyen-tranh.html';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const DEFAULTS: Record<string, string> = {
  status: '0',
  category: 'all',
  genre: '0',
  explicit: '0',
  order: 'updated_at',
};

// Lists and chapters come from POST endpoints that take the page's token, bound to its PHPSESSID.
// Images need the chapter as Referer; the last chapter shown is kept for imageHeaders.
let readerReferer = `${BASE_URL}/`;

interface Loaded {
  document: HtmlElement;
  body: string;
  url: string;
  cookie: string;
}

async function load(url: string): Promise<Loaded> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  const setCookie = Object.entries(response.headers).find(([name]) => name.toLowerCase() === 'set-cookie')?.[1] ?? '';
  return {
    document: html.load(response.body, { baseUrl: response.url }),
    body: response.body,
    url: response.url,
    cookie: /PHPSESSID=[^;,\s]+/.exec(setCookie)?.[0] ?? '',
  };
}

const scriptVar = (body: string, key: string) => new RegExp(`var\\s+${key}\\s*=\\s*'([^']*)'`).exec(body)?.[1];

async function post<T>(page: Loaded, path: string, form: Record<string, string>): Promise<T> {
  return (
    await http.post<T>(
      BASE_URL + path,
      { form },
      {
        headers: {
          ...headers,
          Origin: BASE_URL,
          Referer: page.url,
          'X-Requested-With': 'XMLHttpRequest',
          ...(page.cookie ? { Cookie: page.cookie } : {}),
        },
        responseType: 'json',
      },
    )
  ).body;
}

const normalize = (url: string) => (url.startsWith('//') ? `https:${url}` : url);

async function browse(params: Record<string, string>): Promise<MangaPage> {
  const query = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  const page = await load(`${LIST_PATH}?${query}`);
  const v = (key: string) => scriptVar(page.body, key);
  const token = v('_token');
  const pagiParam = v('pagiParam');
  if (!token || !pagiParam || v('pageCurrent') === undefined) return { items: [], hasNextPage: false };
  const result = await post<{ status: number; htmlBook?: string | null }>(page, '/apps/controllers/book/bookList.php', {
    token,
    pageCurrent: v('pageCurrent') ?? '1',
    pageLast: v('pageLast') ?? '1',
    status: v('status') ?? DEFAULTS.status!,
    ages: v('ages') ?? '',
    category: v('category') ?? DEFAULTS.category!,
    genre: v('genre') ?? '',
    explicit: v('explicit') ?? '',
    magazine: v('magazine') ?? '',
    tags: v('tags') ?? '',
    order: v('order') ?? DEFAULTS.order!,
    pagiParam,
    textSearch: v('textSearch') ?? '',
  });
  if (result.status !== 200 || !result.htmlBook) return { items: [], hasNextPage: false };
  const list = html.load(result.htmlBook, { baseUrl: BASE_URL });
  const items = list.select('div.item-list').flatMap((item): MangaSummary[] => {
    const link = item.selectFirst('div.item-title a');
    if (!link) return [];
    const cover = item.selectFirst('div.item-cover img')?.absUrl('src');
    return [
      {
        url: relativeUrl(link.absUrl('href') ?? ''),
        title: link.text(),
        thumbnailUrl: cover ? normalize(cover) : undefined,
      },
    ];
  });
  const current = Number(v('pageCurrent') ?? params.page ?? 1);
  return { items, hasNextPage: current < Number(v('pageLast') ?? current) };
}

const select = (id: string, label: string, options: [string, string][]): Filter => ({
  type: 'select',
  id,
  label,
  default: DEFAULTS[id] ?? options[0]![1],
  options: options.map(([l, value]) => ({ label: l, value })),
});

function statusOf(text: string | undefined): MangaStatus {
  const value = text?.toLowerCase() ?? '';
  if (value.includes('ongoing') || value.includes('on going')) return 'ongoing';
  if (value.includes('full') || value.includes('completed') || value.includes('hoàn')) return 'completed';
  return 'unknown';
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => browse({ page: String(page), order: 'viewsAll' }),
    getLatest: (page) => browse({ page: String(page) }),
    async getFilters(): Promise<Filter[]> {
      const { document } = await load(LIST_PATH);
      const genres = new Map<string, string>();
      for (const item of document.select('#filterGenre .filter-item[data-slug]')) {
        const id = item.attr('data-slug');
        if (id && item.text().trim() && !genres.has(id)) genres.set(id, item.text().trim());
      }
      return [
        select('status', 'Trạng thái', [
          ['All', '0'],
          ['Full', '1'],
          ['On Going', '2'],
          ['Drop', '3'],
          ['Comming Soon...', '9'],
        ]),
        select('category', 'Thể loại', [
          ['All', 'all'],
          ['Manga', 'manga'],
          ['Manhua', 'manhua'],
          ['Manhwa', 'manhwa'],
          ['Tự Sáng Tác', 'tu-sang-tac'],
        ]),
        select('genre', 'Genre', [['All', '0'], ...[...genres].map(([id, name]): [string, string] => [name, id])]),
        select('explicit', 'Explicit', [
          ['All', '0'],
          ['Ecchi', '21'],
          ['Hentai', '73'],
          ['Oneshot', '230'],
        ]),
        select('order', 'Sắp xếp', [
          ['Ngày cập nhật', 'updated_at'],
          ['Ngày đăng', 'created_at'],
          ['Lượt xem', 'viewsAll'],
        ]),
      ];
    },
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params: Record<string, string> = { page: String(page) };
      if (query) params.textSearch = query;
      for (const [id, fallback] of Object.entries(DEFAULTS)) {
        const value = filters[id];
        if (typeof value === 'string' && value && value !== fallback) params[id] = value;
      }
      return browse(params);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(manga.url);
      const cover = document.selectFirst('div.info-cover-img img')?.absUrl('src');
      return {
        url: manga.url,
        title: document.selectFirst('div.info-name')?.text() || manga.title,
        thumbnailUrl: cover ? normalize(cover) : manga.thumbnailUrl,
        genres: document
          .select('div.info-tag.tag-category span, div.info-tag.tag-genre span, div.info-tag.tag-tag span')
          .map((s) => s.text()),
        status: statusOf(document.selectFirst('div.info-tag.tag-status span')?.text()),
        description: document.selectFirst('div.info-description div.content')?.text() || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { document } = await load(manga.url);
      return document.select('div#TabChapterChapter div.chapter').flatMap((item): Chapter[] => {
        const url = /openUrl\('([^']+)'\)/.exec(item.attr('onclick') ?? '')?.[1];
        if (!url) return [];
        const name =
          item.selectFirst('div.chapter-info div.name-sub')?.text() ||
          item.selectFirst('div.chapter-info div.name')?.text() ||
          '';
        return [
          {
            url: relativeUrl(absoluteUrl(BASE_URL, url)),
            name,
            number: Number(/\d+(?:\.\d+)?/.exec(name)?.[0]) || undefined,
            uploadedAt: parseDate(item.selectFirst('div.chapter-info div.time > div')?.text(), 'dd.MM.yyyy - HH:mm'),
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const page = await load(chapter.url);
      const chapterId = scriptVar(page.body, 'chapterId');
      const token = scriptVar(page.body, '_token');
      if (!chapterId || !token) return [];
      readerReferer = page.url;
      const result = await post<{ status: number; data?: string | null }>(
        page,
        '/apps/controllers/book/bookChapterContent.php',
        {
          token,
          chapterId,
          cookies: 'W10=',
        },
      );
      if (result.status !== 200 || !result.data) return [];
      const content = html.load(result.data, { baseUrl: BASE_URL });
      const urls = content
        .select('img')
        .map((img) => normalize(img.absUrl('data-src') || img.absUrl('src') || ''))
        .filter(Boolean);
      return [...new Set(urls)].map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: readerReferer }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/truyen-tranh\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
