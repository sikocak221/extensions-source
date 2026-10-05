import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { absoluteUrl, hostOf, ownText, parseDate, relativeUrl, selectIgnoreCase } from './common/utils';
import { unpack } from './packer';

const BASE_URL = 'https://www.dm5.com';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
// Some mangas are blocked without the language header.
const headers = { 'User-Agent': USER_AGENT, 'Accept-Language': 'zh-TW', Cookie: 'isAdult=1', Referer: `${BASE_URL}/` };

const SORT_CHAPTER: Preference = {
  type: 'switch',
  key: 'sortChapter',
  label: '依照上傳時間排序章節',
  default: false,
};

const POPULAR_MANGA = 'ul.mh-list > li > div.mh-item';
const NEXT_PAGE = 'div.page-pagination a:contains(>)';
const SEARCH_MANGA = 'ul.mh-list > li, div.banner_detail_form';

async function load(url: string): Promise<{ document: HtmlElement; url: string; body: string }> {
  const response = await http.get(url, { headers });
  return { document: html.load(response.body, { baseUrl: response.url }), url: response.url, body: response.body };
}

const cover = (element: HtmlElement) =>
  element.selectFirst('p.mh-cover')?.attr('style')?.split('url(')[1]?.split(')')[0] || undefined;

function popularFromElement(element: HtmlElement): MangaSummary[] {
  const link = element.selectFirst('h2.title > a');
  if (!link) return [];
  return [
    {
      url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
      title: link.text(),
      thumbnailUrl: cover(element),
    },
  ];
}

async function popularList(path: string): Promise<MangaPage> {
  const { document } = await load(`${BASE_URL}${path}`);
  return {
    items: document.select(POPULAR_MANGA).flatMap(popularFromElement),
    hasNextPage: document.selectFirst(NEXT_PAGE) != null,
  };
}

export default defineExtension({
  preferences: () => [SORT_CHAPTER],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => popularList(`/manhua-list-p${page}/`),
    getLatest: (page) => popularList(`/manhua-list-s2-p${page}/`),
    async search(query, page): Promise<MangaPage> {
      const { document } = await load(`${BASE_URL}/search?title=${encodeURIComponent(query)}&language=1&page=${page}`);
      const items = document.select(SEARCH_MANGA).flatMap((element): MangaSummary[] => {
        const link = element.selectFirst('.title > a');
        if (!link) return [];
        return [
          {
            url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
            title: link.text(),
            thumbnailUrl: element.selectFirst('img')?.absUrl('src') || cover(element),
          },
        ];
      });
      return { items, hasNextPage: document.selectFirst(NEXT_PAGE) != null };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(absoluteUrl(BASE_URL, manga.url));
      const form = document.selectFirst('div.banner_detail_form');
      const content = form?.selectFirst('p.content');
      const statusText = form?.selectFirst('p.tip > span > span')?.text();
      const status: MangaStatus =
        statusText === '连载中' ? 'ongoing' : statusText === '已完结' ? 'completed' : 'unknown';
      const author = form?.selectFirst('p.subtitle > a')?.text();
      return {
        url: manga.url,
        title: ownText(form?.selectFirst('p.title')) || manga.title,
        thumbnailUrl: form?.selectFirst('img')?.absUrl('src') || manga.thumbnailUrl,
        author,
        artist: author,
        genres: (form?.select('p.tip a') ?? []).map((a) => a.text()),
        description: content ? ownText(content) + ownText(content.selectFirst('span')) : undefined,
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { document } = await load(absoluteUrl(BASE_URL, manga.url));
      // It may need a click on the website before the chapters can be read.
      const warning = document.selectFirst('.warning-bar');
      if (warning) throw new Error(warning.text());
      const container = document.selectFirst('div#chapterlistload');
      if (!container) throw new Error('请到网站确认年满18岁；切换网络环境后可稍后再试');
      const titles = document.select('.detail-list-title > a.block').map((a) => a.text().split('（')[0]!);
      const chapters: Chapter[] = container.select('ul').flatMap((ul, i) =>
        ul.select('li > a').map((a): Chapter => {
          const name = a.selectFirst('p.title')?.text() || a.text();
          return {
            url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
            name: a.selectFirst('.detail-lock, .view-lock') ? `🔒 ${name}` : name,
            scanlator: titles[i],
            uploadedAt: parseDate(a.selectFirst('p.tip')?.text(), 'yyyy-MM-dd'),
          };
        }),
      );
      // Sort chapters by url (related to the upload time).
      if (prefs.get<boolean>(SORT_CHAPTER.key)) {
        const id = (c: Chapter) => Number.parseInt(c.url.slice(2, -1), 10) || 0;
        return [...chapters].sort((a, b) => id(b) - id(a));
      }
      // Sometimes the list is in ascending order, probably unread paid manga.
      return selectIgnoreCase(document, 'div.detail-list-title a.order')[0]?.text() === '正序'
        ? [...chapters].reverse()
        : chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document, url } = await load(absoluteUrl(BASE_URL, chapter.url));
      const script = document
        .select('script')
        .map((s) => s.html())
        .find((text) => text.includes('DM5_MID'));
      if (!script) throw new Error('Reader data not found');
      if (!script.includes('DM5_VIEWSIGN_DT'))
        throw new Error(
          document.selectFirst('div.view-pay-form p.subtitle')?.text() ?? 'Required viewsign data missing from script',
        );
      const between = (start: string, end: string) => script.split(start)[1]?.split(end)[0] ?? '';
      const cid = between('var DM5_CID=', ';');
      const images = document.select('div#barChapter > img.load-src');
      if (images.length > 0) return images.map((img, index) => ({ index, imageUrl: img.absUrl('data-src') ?? '' }));
      const mid = between('var DM5_MID=', ';');
      const dt = between('var DM5_VIEWSIGN_DT="', '";');
      const sign = between('var DM5_VIEWSIGN="', '";');
      const count = Number.parseInt(between('var DM5_IMAGE_COUNT=', ';'), 10);
      const base = url.split(/[?#]/)[0]!.replace(/\/+$/, '');
      return Array.from({ length: count }, (_, i) => ({
        index: i,
        url: `${base}/chapterfun.ashx?cid=${cid}&page=${i + 1}&key=&language=1&gtk=6&_cid=${cid}&_mid=${mid}&_dt=${encodeURIComponent(dt)}&_sign=${sign}`,
      }));
    },
    async getImageUrl(page: Page): Promise<string> {
      const pageUrl = page.url ?? '';
      const referer = pageUrl.split('chapterfun.ashx')[0]!;
      const response = await http.get(pageUrl, { headers: { ...headers, Referer: referer } });
      const script = unpack(response.body);
      const pix = script.split('var pix="')[1]?.split('"')[0] ?? '';
      const pvalue = script.split('var pvalue=["')[1]?.split('"')[0] ?? '';
      const query = /pix\+pvalue\[i\]\+["']([^"']*)["']/.exec(script)?.[1] ?? '';
      return pix + pvalue + query;
    },
    imageHeaders: () => ({ ...headers, Referer: `${BASE_URL}/` }),
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)(\/manhua-[^?#]*)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase().replace(/^(www|m)\./, '') !== hostOf(BASE_URL).replace(/^www\./, ''))
        return null;
      return { url: match[2]!, title: '' };
    },
  }),
});
