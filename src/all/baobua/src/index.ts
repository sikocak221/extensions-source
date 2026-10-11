import {
  type Chapter,
  type Filter,
  type HtmlElement,
  type MangaPage,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://baobua.net';
const HEADERS = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const IMAGE_SELECTOR = 'div.contentme a[href^="/img.html"] img';
const CATEGORIES = [
  ['', ''],
  ['Ao-yem', 'Ao-yem'],
  ['Asia', 'Asia'],
  ['Beauty', 'beauty'],
  ['Bikini', 'Bikini'],
  ['China', 'China'],
  ['Cosplay', 'Cosplay'],
  ['Japan', 'Japan'],
  ['Nude', 'Nude'],
  ['Sexy', 'Sexy'],
  ['Top', 'Top'],
  ['Tattoo', 'tattoo'],
  ['Vietnam', 'Vietnam'],
] as const;

async function fetchDocument(url: string): Promise<{ document: HtmlElement; url: string; body: string }> {
  const response = await http.get(url, { headers: HEADERS });
  return { document: html.load(response.body, { baseUrl: response.url }), url: response.url, body: response.body };
}

function normalizeImageUrl(url: string): string {
  if (/^https:\/\/i\d+\.wp\.com\//.test(url))
    return url.replace(/https:\/\/i\d+\.wp\.com\//, 'https://').replace('?w=640', '');
  return url;
}

function parseMangas(document: HtmlElement): MangaPage {
  const items = document.select('.thcovering-video').flatMap((element) => {
    const link = element.selectFirst('a.denomination');
    if (!link) return [];
    const thumb = element.selectFirst('img.xld')?.absUrl('src');
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: link.text(),
        thumbnailUrl: thumb ? normalizeImageUrl(thumb) : undefined,
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('a.page-numbers.next') !== null };
}

async function getPopular(page: number): Promise<MangaPage> {
  return parseMangas((await fetchDocument(`${BASE_URL}/?page=${page}`)).document);
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular,
    search: async (query, page, filters) => {
      if (query.trim()) {
        const { document } = await fetchDocument(withQuery(`${BASE_URL}/search`, { q: query, page: String(page) }));
        return parseMangas(document);
      }
      const category = filters.category;
      if (typeof category === 'string' && category) {
        const { document } = await fetchDocument(`${BASE_URL}/category/${category}?page=${page}`);
        return parseMangas(document);
      }
      return getPopular(page);
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'category',
        label: 'Category',
        options: CATEGORIES.map(([label, value]) => ({ label, value })),
      },
    ],
    getMangaDetails: async (manga) => {
      const { document } = await fetchDocument(BASE_URL + manga.url);
      return {
        url: manga.url,
        title: manga.title,
        thumbnailUrl: manga.thumbnailUrl,
        genres: document.select('.it-categories a').map((a) => a.text()),
        status: 'completed',
      };
    },
    getChapters: async (manga): Promise<Chapter[]> => {
      const { document, url, body } = await fetchDocument(BASE_URL + manga.url);
      const canonical = document.selectFirst('link[rel=canonical]')?.absUrl('href') || url;
      const published = /"datePublished":"([^"]+)"/.exec(body)?.[1];
      const time = published ? Date.parse(published) : Number.NaN;
      return [
        {
          url: relativeUrl(canonical),
          name: 'Gallery',
          number: 0,
          uploadedAt: Number.isNaN(time) ? undefined : time,
        },
      ];
    },
    getPages: async (chapter): Promise<Page[]> => {
      const pages: Page[] = [];
      let { document } = await fetchDocument(BASE_URL + chapter.url);
      for (let guard = 0; guard < 200; guard++) {
        for (const img of document.select(IMAGE_SELECTOR)) {
          pages.push({ index: pages.length, imageUrl: normalizeImageUrl(img.absUrl('src') || '') });
        }
        const next = document
          .select('a.page-numbers')
          .find((a) => a.text().includes('Next'))
          ?.absUrl('href');
        if (!next) break;
        ({ document } = await fetchDocument(next));
      }
      return pages;
    },
    imageHeaders: () => HEADERS,
    resolveUrl: (url) => (hostOf(url) === hostOf(BASE_URL) ? { url: relativeUrl(url), title: '' } : null),
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
