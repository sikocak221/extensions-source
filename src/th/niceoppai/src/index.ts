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
import { USER_AGENT, absoluteUrl, hostOf, ownText, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://www.niceoppai.net';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const ORDERS: [label: string, value: string][] = [
  ['Name (A-Z)', 'name-az'],
  ['Name (Z-A)', 'name-za'],
  ['Last Updated', 'last-updated'],
  ['Oldest Updated', 'oldest-updated'],
  ['Most Popular', 'most-popular'],
  ['Most Popular (Weekly)', 'most-popular-weekly'],
  ['Most Popular (Monthly)', 'most-popular-monthly'],
  ['Least Popular', 'least-popular'],
  ['Last Added', 'last-added'],
  ['Early Added', 'early-added'],
  ['Top Rating', 'top-rating'],
  ['Lowest Rating', 'lowest-rating'],
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function parseMangaList(document: HtmlElement): MangaPage {
  const items = document.select('div.fcard').flatMap((element): MangaSummary[] => {
    const link = element.selectFirst('a.fcard__title');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: link.text(),
        thumbnailUrl: element.selectFirst('img.cover__img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.select('ul.pgg li a').some((a) => a.text() === 'Next') };
}

function fact(info: HtmlElement, label: string): HtmlElement | undefined {
  return info.select('div.fact').find((element) => element.selectFirst('span')?.text() === label);
}

function parseChapters(document: HtmlElement): Chapter[] {
  return document.select('a.chrow').map((element): Chapter => {
    const id = element.attr('data-ch') ?? '';
    const number = /^\d+(?:\.\d+)?/.exec(id)?.[0] ?? id;
    const title = ownText(element.selectFirst('div.chrow__t'));
    // Dates are local (Bangkok, UTC+7) and have no time.
    const date = parseDate(element.selectFirst('div.chrow__d')?.text(), 'MMM dd, yyyy');
    return {
      url: relativeUrl(element.absUrl('href') || element.attr('href') || ''),
      name: !title || title === number ? `ตอนที่ ${number}` : `ตอนที่ ${number} - ${title}`,
      number: Number.parseFloat(number) || -1,
      uploadedAt: date === undefined ? undefined : date - 7 * 3_600_000,
    };
  });
}

async function chapterList(document: HtmlElement): Promise<Chapter[]> {
  const pageUrls = document
    .select('ul.pgg li a')
    .filter((a) => /^\d+$/.test(a.text().trim()))
    .map((a) => a.absUrl('href') || a.attr('href') || '');
  if (pageUrls.length === 0) return parseChapters(document);
  const pages = await Promise.all(pageUrls.map(async (url) => parseChapters(await load(url))));
  return pages.flat();
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => parseMangaList(await load(`/manga_list/all/any/most-popular-monthly/${page}`)),
    getLatest: async (page) => parseMangaList(await load(`/manga_list/all/any/last-updated/${page}`)),
    async search(query, page, filters): Promise<MangaPage> {
      const order = typeof filters.order === 'string' && filters.order ? filters.order : ORDERS[0]![1];
      const path = query.trim()
        ? `/manga_list/search/${encodeURIComponent(query)}/${order}/${page}`
        : `/manga_list/all/any/${order}/${page}`;
      return parseMangaList(await load(path));
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'order',
        label: 'Order By เรียกตาม',
        options: ORDERS.map(([label, value]) => ({ label, value })),
        default: ORDERS[0]![1],
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const info = document.selectFirst('div.series__info');
      if (!info) throw new Error('Manga details not found');
      const author = fact(info, 'ผู้แต่ง')?.selectFirst('b a')?.text();
      const status = fact(info, 'สถานะ')?.selectFirst('b')?.text();
      return {
        url: manga.url,
        title: info.selectFirst('h1')?.text() || manga.title,
        author,
        artist: author,
        status: status === 'ยังไม่จบ' ? 'ongoing' : status === 'จบแล้ว' ? 'completed' : 'unknown',
        genres: info.select('div.series__genres a.chip--genre').map((a) => a.text()),
        description: info.selectFirst('p.series__syn')?.text() || undefined,
        thumbnailUrl: document.selectFirst('div.series__cover img.cover__img')?.absUrl('src') || manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      return chapterList(await load(manga.url));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      return document
        .select('#image-container > center > img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.attr('src') || '' }))
        .filter((page) => page.imageUrl);
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)\/([^/?#]+)\/?(?:[^/?#]+\/?)?(?:[?#].*)?$/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase().replace(/^www\./, '') !== hostOf(BASE_URL).replace(/^www\./, ''))
        return null;
      if (match[2] === 'manga_list') return null;
      return { url: `/${match[2]}/`, title: '' };
    },
  }),
});
