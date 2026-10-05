import {
  type Chapter,
  type Filter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { absoluteUrl, hostOf, ownText, parseDate, relativeUrl } from './common/utils';
import { unpack } from './packer';

const BASE_URL = 'https://mangabz.com';
const LANG_COOKIE = 'mangabz_lang';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0';

const ZH_HANT: Preference = {
  type: 'switch',
  key: 'showZhHantWebsite',
  label: '使用繁体中文',
  description: '已添加的漫画需要迁移才能更新标题',
  default: false,
};

const requestHeaders = () => ({
  'User-Agent': USER_AGENT,
  Referer: `${BASE_URL}/`,
  Cookie: `${LANG_COOKIE}=${prefs.get<boolean>(ZH_HANT.key) ? '1' : '2'}`,
});

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers: requestHeaders() });
  return html.load(response.body, { baseUrl: response.url });
}

function parseMangaList(document: HtmlElement): MangaPage {
  const list = document.selectFirst('.mh-list');
  const items = (list?.select(':scope > *') ?? []).map((element): MangaSummary => ({
    title: element.selectFirst('h2')?.text() ?? '',
    url: element.selectFirst('a')?.attr('href') ?? '',
    thumbnailUrl: element.selectFirst('img')?.attr('src') || undefined,
  }));
  const links = document.selectFirst('.page-pagination')?.select('a') ?? [];
  return { items, hasNextPage: links.length > 0 && links[links.length - 1]!.text() === '>' };
}

/** Chapter dates: "今天 12:00", "01月01号" (current year) or "2021-01-01", all GMT+8. */
function parseListDate(source: string): number | undefined {
  const GMT8 = 8 * 3_600_000;
  const recent = /^([今昨前])天 (\d{2}):(\d{2})$/.exec(source);
  if (recent) {
    const offset = recent[1] === '今' ? 0 : recent[1] === '昨' ? 1 : 2;
    const local = new Date(Date.now() + GMT8);
    const day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - offset);
    return day + (Number(recent[2]) * 60 + Number(recent[3])) * 60_000 - GMT8;
  }
  if (source.length >= 6 && source[2] === '月') {
    const year = new Date(Date.now() + GMT8).getUTCFullYear();
    const time = parseDate(`${year} ${source.slice(0, 5)}`, 'yyyy MM月dd');
    return time === undefined ? undefined : time - GMT8;
  }
  const time = parseDate(source, 'yyyy-MM-dd');
  return time === undefined ? undefined : time - GMT8;
}

function parseDetails(document: HtmlElement, manga: MangaSummary): MangaDetails {
  const details = document.select('.detail-info-tip > *');
  const title = ownText(document.selectFirst('.detail-info-title'));
  const statusText = ownText(details[1]?.selectFirst('*'));
  const status: MangaStatus = /^(连载中|連載中)$/.test(statusText)
    ? 'ongoing'
    : /^(已完结|已完結)$/.test(statusText)
      ? 'completed'
      : 'unknown';
  const content = document.selectFirst('.detail-info-content');
  const text = ownText(content);
  const start = text.replace(`${title}漫画 ，`, '').replace(`${title}漫畫 ，`, '');
  const collapsed = ownText(content?.selectFirst('span'));
  return {
    url: manga.url,
    title: title || manga.title,
    thumbnailUrl: document.selectFirst('.detail-info-cover')?.attr('src') || manga.thumbnailUrl,
    status,
    author: (details[0]?.select('*') ?? []).map((e) => ownText(e)).join(', ') || undefined,
    genres: (details[2]?.select('*') ?? []).map((e) => ownText(e)),
    description: collapsed ? start + collapsed : start,
  };
}

function parseChapters(document: HtmlElement): Chapter[] {
  const list = (document.selectFirst('#chapterlistload')?.select(':scope > *') ?? []).map((element): Chapter => {
    const name = ownText(element);
    const count = ownText(element.selectFirst('*'));
    const number = /\d+(?:\.\d+)?/.exec(name)?.[0];
    return { url: element.attr('href') ?? '', name: name + count, number: number ? Number.parseFloat(number) : -2 };
  });
  if (list.length === 0) return [];
  const listTitle = ownText(document.selectFirst('.detail-list-form-title'));
  list[0]!.uploadedAt = parseListDate(listTitle.split(', ').pop() ?? '');
  return list;
}

// The chapter image request answers 2 pages (15 when the site's cache is warm): remember the paths.
const imageUrlCache = new Map<number, (string | undefined)[]>();

export default defineExtension({
  preferences: () => [ZH_HANT],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => parseMangaList(await load(`/manga-list-p${page}/`)),
    getLatest: async (page) => parseMangaList(await load(`/manga-list-0-0-2-p${page}/`)),
    async search(query, page, filters): Promise<MangaPage> {
      if (!query.trim()) {
        const ids = Object.entries(filters)
          .filter(([id]) => id.startsWith('cat.'))
          .sort(([a], [b]) => Number(a.slice(4)) - Number(b.slice(4)))
          .map(([, value]) => String(value))
          .join('-');
        if (ids) return parseMangaList(await load(`/manga-list-${ids}-p${page}/`));
        return parseMangaList(await load(`/manga-list-p${page}/`));
      }
      return parseMangaList(await load(`/search?title=${encodeURIComponent(query)}&page=${page}`));
    },
    async getFilters(): Promise<Filter[]> {
      try {
        const document = await load('/manga-list-p1/');
        const lines = document.select('.class-line');
        if (lines.length === 0) return [];
        const defaults: number[] = new Array(lines.length).fill(0);
        const parsed = lines.map((line, filterIndex) => {
          const options = line.select('a').map((option, optionIndex): [string, number] => {
            const name = ownText(option);
            if (optionIndex === 0) return [name, 0];
            const tuple = (option.attr('href') ?? '')
              .replace(/^\/manga-list-/, '')
              .replace(/\/$/, '')
              .split('-');
            tuple.forEach((id, i) => {
              if (i !== filterIndex) defaults[i] = Number(id);
            });
            return [name, Number(tuple[filterIndex])];
          });
          const label = ownText(line.selectFirst('*')).replace(/：$/, '');
          return { label, options };
        });
        const filters: Filter[] = [{ type: 'header', label: '分类（搜索文本时无效）' }];
        parsed.forEach(({ label, options }, i) => {
          options[0]![1] = defaults[i]!;
          filters.push({
            type: 'select',
            id: `cat.${i}`,
            label,
            options: options.map(([l, value]) => ({ label: l, value: String(value) })),
            default: String(defaults[i]),
          });
        });
        return filters;
      } catch (error) {
        log.warn('Cannot load categories', error);
        return [];
      }
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      return parseDetails(await load(manga.url), manga);
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      return parseChapters(await load(manga.url));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const chapterId = chapter.url.replace(/^\/m/, '').replace(/\/$/, '');
      const pageCount = Number.parseInt(chapter.name.split('（').pop()!.replace(/P）$/, ''), 10);
      const prefix = `${BASE_URL}${chapter.url}chapterimage.ashx?cid=${chapterId}&page=`;
      return Array.from({ length: pageCount }, (_, index) => ({ index, url: `${prefix}${index + 1}#${pageCount}` }));
    },
    async getImageUrl(page: Page): Promise<string> {
      const [requestUrl, fragment] = (page.url ?? '').split('#');
      const chapterId = Number(/[?&]cid=(\d+)/.exec(requestUrl!)?.[1]);
      const pageCount = Number(fragment);
      const cache = imageUrlCache.get(chapterId) ?? new Array<string | undefined>(pageCount + 1);
      imageUrlCache.set(chapterId, cache);
      if (imageUrlCache.size > 10) imageUrlCache.delete(imageUrlCache.keys().next().value as number);
      const cached = cache[page.index + 1];
      if (cached !== undefined) return cache[0]! + cached;
      const response = await http.get(requestUrl!, {
        headers: { ...requestHeaders(), Referer: requestUrl!.split('chapterimage.ashx')[0]! },
      });
      const script = unpack(response.body);
      const prefix = script.split('pix="')[1]?.split('"')[0] ?? '';
      // 2 pages, or 15 if the server cache is ready
      const paths = (script.split('["')[1]?.split('"]')[0] ?? '').split('","');
      cache[0] = prefix;
      paths.forEach((path, offset) => {
        cache[page.index + 1 + offset] = path;
      });
      return prefix + paths[0];
    },
    imageHeaders: () => requestHeaders(),
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)(\/[^/?#]+bz\/)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase().replace(/^www\./, '') !== hostOf(BASE_URL)) return null;
      return { url: relativeUrl(match[2]!), title: '' };
    },
  }),
});
