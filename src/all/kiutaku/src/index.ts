import {
  type Chapter,
  type HtmlElement,
  type MangaPage,
  type MangaSummary,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://kiutaku.com';
// Image host (mitaku.net) blocks hotlinking with a kiutaku.com Referer
const HEADERS = { 'User-Agent': USER_AGENT };
const start = (page: number): number => (page - 1) * 20;

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers: HEADERS });
  return html.load(response.body, { baseUrl: response.url });
}

function mangaFromElement(element: HtmlElement): MangaSummary {
  const link = element.selectFirst('a.item-link');
  return {
    url: relativeUrl(link?.absUrl('href') || link?.attr('href') || ''),
    title: element.selectFirst('h2')?.text() || 'Cosplay',
    thumbnailUrl: element.selectFirst('img')?.absUrl('src'),
  };
}

function parseMangaList(document: HtmlElement): MangaPage {
  return {
    items: document
      .select('div.blog > div.items-row')
      .map(mangaFromElement)
      .filter((m) => m.url),
    hasNextPage: document.selectFirst('nav > a.pagination-next:not([disabled])') !== null,
  };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => parseMangaList(await fetchDocument(`${BASE_URL}/hot?start=${start(page)}`)),
    getLatest: async (page) => parseMangaList(await fetchDocument(`${BASE_URL}/?start=${start(page)}`)),
    search: async (query, page) =>
      parseMangaList(await fetchDocument(withQuery(BASE_URL, { search: query, start: String(start(page)) }))),
    getMangaDetails: async (manga) => {
      const document = await fetchDocument(BASE_URL + manga.url);
      const tags =
        document
          .selectFirst('div.article-tags')
          ?.select('a.tag > span')
          .map((s) => s.text().replace(/^#+/, '')) ?? [];
      return {
        url: manga.url,
        title: document.selectFirst('div.article-header')?.text() || manga.title,
        thumbnailUrl: manga.thumbnailUrl,
        genres: tags,
        status: 'completed',
      };
    },
    getChapters: async (manga): Promise<Chapter[]> => {
      const document = await fetchDocument(BASE_URL + manga.url);
      return document
        .select('nav.pagination:first-of-type a')
        .map((element): Chapter => {
          const text = element.text();
          const number = Number.parseFloat(text);
          return {
            url: relativeUrl(element.absUrl('href') || element.attr('href') || ''),
            name: `Page ${text}`,
            number: Number.isNaN(number) ? 1 : number,
          };
        })
        .reverse();
    },
    getPages: async (chapter) => {
      const document = await fetchDocument(BASE_URL + chapter.url);
      return document
        .select('div.article-fulltext img[src]')
        .map((item, index) => ({ index, imageUrl: item.absUrl('src') }));
    },
    imageHeaders: () => HEADERS,
    resolveUrl: (url) => (hostOf(url) === hostOf(BASE_URL) ? { url: relativeUrl(url), title: '' } : null),
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
