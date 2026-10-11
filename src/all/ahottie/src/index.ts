import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://ahottie.top';
const HEADERS = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers: HEADERS });
  return html.load(response.body, { baseUrl: response.url });
}

function parseMangas(document: HtmlElement): MangaPage {
  const items = document.select('#main > div > div').map((element): MangaSummary => {
    const link = element.selectFirst('a');
    return {
      url: relativeUrl(link?.absUrl('href') || link?.attr('href') || ''),
      title: element.selectFirst('h2')?.text() ?? '',
      thumbnailUrl: element.selectFirst('.relative img')?.absUrl('src'),
    };
  });
  return { items: items.filter((m) => m.url && m.title), hasNextPage: document.selectFirst('a[rel=next]') !== null };
}

function parseDetails(document: HtmlElement, manga: MangaSummary): MangaDetails | null {
  const title = document.selectFirst('h1')?.text();
  if (!title || !document.selectFirst('div.pl-3 > a')) return null;
  return {
    url: manga.url,
    title,
    genres: document.select('div.pl-3 > a').map((a) => a.text()),
    status: 'unknown',
  };
}

function parseDate(text: string | undefined): number | undefined {
  const match = /(\d{4})-(\d{2})-(\d{2})/.exec(text ?? '');
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => parseMangas(await fetchDocument(withQuery(BASE_URL, { page: String(page) }))),
    search: async (query, page) => {
      const url = withQuery(`${BASE_URL}/search`, { kw: query, page: String(page) });
      const document = await fetchDocument(url);
      const single = parseDetails(document, { url: relativeUrl(url), title: '' });
      if (single) return { items: [{ url: relativeUrl(url), title: single.title }], hasNextPage: false };
      return parseMangas(document);
    },
    getMangaDetails: async (manga) => {
      const document = await fetchDocument(BASE_URL + manga.url);
      const details = parseDetails(document, manga);
      if (!details) throw new Error('Title not found');
      return details;
    },
    getChapters: async (manga): Promise<Chapter[]> => {
      const document = await fetchDocument(BASE_URL + manga.url);
      const canonical = document.selectFirst('link[rel=canonical]');
      if (!canonical) throw new Error('Chapter link not found');
      return [
        {
          url: relativeUrl(canonical.absUrl('href') || canonical.attr('href') || ''),
          name: 'GALLERY',
          number: 0,
          uploadedAt: parseDate(document.selectFirst('time')?.text()),
        },
      ];
    },
    getPages: async (chapter): Promise<Page[]> => {
      const pages: Page[] = [];
      let document = await fetchDocument(BASE_URL + chapter.url);
      for (let guard = 0; guard < 200; guard++) {
        for (const img of document.select('#main img.block')) {
          pages.push({ index: pages.length, imageUrl: img.absUrl('src') });
        }
        const next = document.selectFirst('a[rel=next]')?.absUrl('href');
        if (!next) break;
        document = await fetchDocument(next);
      }
      return pages;
    },
    imageHeaders: () => HEADERS,
    resolveUrl: (url) => {
      if (!url.startsWith(BASE_URL)) return null;
      return { url: relativeUrl(url), title: '' };
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
