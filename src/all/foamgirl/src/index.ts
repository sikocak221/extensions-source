import { type Chapter, type HtmlElement, type MangaPage, type Page, defineExtension } from '@matane/extension-sdk';
import { USER_AGENT, hostOf, parseDate, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://foamgirl.net';
const HEADERS = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers: HEADERS });
  return html.load(response.body, { baseUrl: response.url });
}

function parseMangaList(document: HtmlElement): MangaPage {
  const items = document.select('.update_area .i_list').map((element) => ({
    url: relativeUrl(element.selectFirst('a')?.absUrl('href') || element.selectFirst('a')?.attr('href') || ''),
    title: element.selectFirst('a.meta-title')?.text() ?? '',
    thumbnailUrl: element.selectFirst('img')?.attr('data-original'),
  }));
  return { items: items.filter((m) => m.url && m.title), hasNextPage: document.selectFirst('a.next') !== null };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => parseMangaList(await fetchDocument(`${BASE_URL}/page/${page}`)),
    search: async (query, page) =>
      parseMangaList(await fetchDocument(withQuery(`${BASE_URL}/page/${page}`, { post_type: 'post', s: query }))),
    getMangaDetails: async (manga) => ({
      url: manga.url,
      title: manga.title,
      thumbnailUrl: manga.thumbnailUrl,
      status: 'unknown',
    }),
    getChapters: async (manga): Promise<Chapter[]> => {
      const document = await fetchDocument(BASE_URL + manga.url);
      const canonical = document.selectFirst('link[rel=canonical]');
      const time = document.selectFirst('span.image-info-time')?.text().trim().substring(1);
      return [
        {
          url: relativeUrl(canonical?.absUrl('href') || canonical?.attr('href') || manga.url),
          name: 'GALLERY',
          number: 0,
          uploadedAt: parseDate(time, 'yyyy.M.d'),
        },
      ];
    },
    getPages: async (chapter): Promise<Page[]> => {
      const pages: Page[] = [];
      let document = await fetchDocument(BASE_URL + chapter.url);
      for (let guard = 0; guard < 300; guard++) {
        for (const element of document.select('.imageclick-imgbox')) {
          pages.push({ index: pages.length, imageUrl: element.absUrl('href') || element.attr('href') });
        }
        const next = document.selectFirst('.page-numbers[title="Next page"]')?.absUrl('href');
        if (!next || !/\d+_\d+/.test(next)) break;
        document = await fetchDocument(next);
      }
      return pages;
    },
    imageHeaders: () => HEADERS,
    resolveUrl: (url) => (hostOf(url) === hostOf(BASE_URL) ? { url: relativeUrl(url), title: '' } : null),
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
