import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, ownText, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://www.dongmanmanhua.cn';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function mangaFromElement(element: HtmlElement): MangaSummary {
  return {
    url: relativeUrl(element.attr('href') ?? ''),
    title: element.selectFirst('p.subj')?.text() ?? '',
    thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined,
  };
}

/** Distinct entries of a long page; yields now and then (the sandbox stops code running over 2 s). */
async function entries(elements: HtmlElement[]): Promise<MangaSummary[]> {
  const seen = new Set<string>();
  const items: MangaSummary[] = [];
  for (const [index, element] of elements.entries()) {
    if (index % 100 === 99) await timers.sleep(0);
    const url = relativeUrl(element.attr('href') ?? '');
    if (seen.has(url)) continue;
    seen.add(url);
    items.push(mangaFromElement(element));
  }
  return items;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const document = await load('/dailySchedule');
      const items = await entries(document.select('div#dailyList .daily_section li a, div.daily_lst.comp li a'));
      return { items, hasNextPage: false };
    },
    async getLatest(): Promise<MangaPage> {
      const document = await load('/dailySchedule?sortOrder=UPDATE&webtoonCompleteType=ONGOING');
      const day = `div._list_${DAYS[new Date().getDay()]}`;
      const items = await entries(document.select(`div#dailyList > ${day} li > a`));
      return { items, hasNextPage: false };
    },
    async search(query, page): Promise<MangaPage> {
      const document = await load(`/search?keyword=${encodeURIComponent(query)}${page > 1 ? `&page=${page}` : ''}`);
      const items = document.select('#content > div.card_wrap.search ul:not(#filterLayer) li a').map(mangaFromElement);
      return { items, hasNextPage: document.selectFirst('div.more_area, div.paginate a[onclick] + a') != null };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const detail = document.selectFirst('.detail_header .info');
      const info = document.selectFirst('#_asideDetail');
      const author =
        ownText(detail?.selectFirst('.author:nth-of-type(1)')) ||
        ownText(detail?.selectFirst('.author_area')) ||
        undefined;
      const artist =
        ownText(detail?.selectFirst('.author:nth-of-type(2)')) ||
        ownText(detail?.selectFirst('.author_area')) ||
        author;
      const dayInfo = info?.selectFirst('p.day_info')?.text() ?? '';
      const status: MangaStatus = dayInfo.includes('更新')
        ? 'ongoing'
        : dayInfo.includes('完结')
          ? 'completed'
          : 'unknown';
      const style = document.selectFirst('#content > div.cont_box > div.detail_body')?.attr('style');
      const fromStyle = style?.includes('url(')
        ? style.slice(style.indexOf('url(') + 4, style.lastIndexOf(')')).replace(/^["']|["']$/g, '')
        : undefined;
      const discover = document
        .select('#content > div.cont_box > div.detail_header > span.thmb img')
        .find((img) => img.attr('alt') !== 'Representative image')
        ?.attr('src');
      return {
        url: manga.url,
        title: document.selectFirst('h1.subj, h3.subj')?.text() || manga.title,
        author,
        artist,
        genres: (detail?.select('.genre') ?? []).map((e) => e.text()),
        description: info?.selectFirst('p.summary')?.text() || undefined,
        status,
        thumbnailUrl: fromStyle?.trim() || discover || manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      let document = await load(manga.url);
      const chapters: Chapter[] = [];
      for (;;) {
        for (const element of document.select('ul#_listUl li')) {
          chapters.push({
            name: element.selectFirst('span.subj span')?.text() ?? '',
            url: relativeUrl(element.selectFirst('a')?.absUrl('href') ?? ''),
            uploadedAt: parseDate(element.selectFirst('span.date')?.text(), 'yyyy-M-d'),
          });
        }
        const next = document.selectFirst('div.paginate a[onclick] + a')?.absUrl('href');
        if (!next) break;
        document = await load(next);
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      return document
        .select('div#_imageList > img')
        .map((img, index) => ({ index, imageUrl: img.attr('data-url') ?? '' }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)(\/[^?#]*\/list\?title_no=\d+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase().replace(/^www\./, '') !== hostOf(BASE_URL).replace(/^www\./, ''))
        return null;
      return { url: match[2]!, title: '' };
    },
  }),
});
