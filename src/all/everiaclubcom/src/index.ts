import {
  type Chapter,
  type Filter,
  type HtmlElement,
  type MangaPage,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, decodeEntities, hostOf, ownText, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://www.everiaclub.com';
const HEADERS = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const CATEGORIES: [string, string][] = [
  ['Any', ''],
  ['Gravure', 'Gravure.html'],
  ['Japan', 'Japan.html'],
  ['Korea', 'Korea.html'],
  ['Thailand', 'Thailand.html'],
  ['Chinese', 'Chinese.html'],
  ['Cosplay', 'Cosplay.html'],
];

function imgSrc(element: HtmlElement | null | undefined): string | undefined {
  if (!element) return undefined;
  for (const name of ['data-original', 'data-lazy-src', 'data-src', 'src']) {
    const value = element.attr(name);
    if (value !== undefined) return element.absUrl(name) || value;
  }
  return undefined;
}

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers: HEADERS });
  return html.load(response.body, { baseUrl: response.url });
}

function mangaFromElement(element: HtmlElement) {
  const img = element.selectFirst('img');
  return {
    url: relativeUrl(element.absUrl('href') || element.attr('href') || ''),
    title: decodeEntities(img?.attr('title') ?? ''),
    thumbnailUrl: imgSrc(img),
  };
}

function parseMangaList(document: HtmlElement): MangaPage {
  const items = document.select('.mainleft .leftp > a').map(mangaFromElement);
  return { items, hasNextPage: document.selectFirst('li:has(span.current) + li > a') !== null };
}

const listPage = async (page: number): Promise<MangaPage> =>
  parseMangaList(await fetchDocument(`${BASE_URL}/?page=${page}`));

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async () => {
      const document = await fetchDocument(BASE_URL);
      return { items: document.select('.mainright li a').map(mangaFromElement), hasNextPage: false };
    },
    getLatest: listPage,
    search: async (query, page, filters) => {
      const tag = typeof filters.tag === 'string' ? filters.tag.trim() : '';
      const category = typeof filters.category === 'string' ? filters.category : '';
      let url: string;
      if (tag) url = `${BASE_URL}/tags/${encodeURIComponent(tag)}/${page}`;
      else if (category) url = `${BASE_URL}/${category}?page=${page}`;
      else if (query.trim()) url = withQuery(`${BASE_URL}/search/`, { keyword: query, page: String(page) });
      else url = `${BASE_URL}/?page=${page}`;
      return parseMangaList(await fetchDocument(url));
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'NOTE: Only one filter will be applied!' },
      { type: 'separator' },
      { type: 'text', id: 'tag', label: 'Tag' },
      {
        type: 'select',
        id: 'category',
        label: 'Category',
        options: CATEGORIES.map(([label, value]) => ({ label, value })),
      },
    ],
    getMangaDetails: async (manga) => {
      const document = await fetchDocument(BASE_URL + manga.url);
      return {
        url: manga.url,
        title: manga.title,
        thumbnailUrl: manga.thumbnailUrl,
        genres: document.select('div.end span:contains(Tags:) ~ a > p.tags').map((p) => ownText(p) || p.text()),
        status: 'completed',
      };
    },
    getChapters: async (manga): Promise<Chapter[]> => [{ url: manga.url, name: 'Gallery', number: 1 }],
    getPages: async (chapter): Promise<Page[]> => {
      const document = await fetchDocument(BASE_URL + chapter.url);
      return document.select('.mainleft img').map((img, index) => ({ index, imageUrl: imgSrc(img) }));
    },
    imageHeaders: () => HEADERS,
    resolveUrl: (url) => (hostOf(url) === hostOf(BASE_URL) ? { url: relativeUrl(url), title: '' } : null),
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
