import {
  type Chapter,
  type Filter,
  type HtmlElement,
  type MangaPage,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { hostOf, parseDate, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://buondua.com';
const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.36';
const HEADERS = { 'User-Agent': MOBILE_UA, Referer: `${BASE_URL}/` };
const PREF_SPLIT_PAGES = 'pref_split_pages';
const PAGE_SELECTOR = '.article-fulltext img';
const PAGE_SIZE = 20;

const preferences: Preference[] = [
  {
    type: 'switch',
    key: PREF_SPLIT_PAGES,
    label: 'Split into multiple pages',
    description: 'Off: single gallery',
    default: true,
  },
];

const splitPages = (): boolean => prefs.get<boolean>(PREF_SPLIT_PAGES) ?? true;

async function fetchDocument(url: string): Promise<{ document: HtmlElement; url: string }> {
  const response = await http.get(url, { headers: HEADERS });
  return { document: html.load(response.body, { baseUrl: response.url }), url: response.url };
}

function parseMangas(document: HtmlElement): MangaPage {
  const items = document.select('.blog > div').flatMap((element) => {
    const link = element.selectFirst('.item-content .item-link');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: link.text(),
        thumbnailUrl: element.selectFirst('img')?.absUrl('src'),
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('.pagination-next:not([disabled])') !== null };
}

function lastPageNumber(document: HtmlElement): number {
  const links = document.select('nav.pagination:first-of-type a.pagination-next');
  const href = links[links.length - 1]?.absUrl('href');
  const page = href?.startsWith('http') ? /[?&]page=(\d+)/.exec(href)?.[1] : undefined;
  return page ? Number(page) : 1;
}

const withPage = (url: string, page: number): string => withQuery(url, { page: String(page) });

export default defineExtension({
  preferences: () => preferences,
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) =>
      parseMangas((await fetchDocument(`${BASE_URL}/hot?start=${PAGE_SIZE * (page - 1)}`)).document),
    getLatest: async (page) =>
      parseMangas((await fetchDocument(`${BASE_URL}/?start=${PAGE_SIZE * (page - 1)}`)).document),
    search: async (query, page, filters) => {
      const start = PAGE_SIZE * (page - 1);
      const tag = filters.tag;
      let url: string;
      if (query.trim()) url = withQuery(BASE_URL, { search: query, start: String(start) });
      else if (typeof tag === 'string' && tag.trim()) url = `${BASE_URL}/tag/${tag.trim()}&start=${start}`;
      else url = `${BASE_URL}/hot?start=${start}`;
      return parseMangas((await fetchDocument(url)).document);
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'NOTE: Ignored if using text search!' },
      { type: 'separator' },
      { type: 'text', id: 'tag', label: 'Tag ID' },
    ],
    getMangaDetails: async (manga) => {
      const { document } = await fetchDocument(BASE_URL + manga.url);
      const title = document
        .selectFirst('.article-header')
        ?.text()
        .replace(/ - \( Page \d+ \/ \d+ \)/, '')
        .trim();
      const info = document
        .select('.article-info > strong')
        .map((e) => e.text())
        .join(' ')
        .replace('Buondua', '')
        .trim();
      const password = document
        .select('code')
        .map((e) => e.text())
        .join(' ');
      const links = document
        .select('.article-links a[href]')
        .map((a) => `[${a.text()}](${a.attr('href')})`)
        .join('\n');
      const description = [info, links, password].filter((part) => part.trim()).join('\n\n');
      const genres = (document.selectFirst('.article-tags')?.select('.tags > .tag') ?? [])
        .map((tag) => tag.text().replace(/^.*?#/, ''))
        .filter(Boolean);
      return {
        url: manga.url,
        title: title || manga.title,
        thumbnailUrl: manga.thumbnailUrl,
        description,
        genres,
        status: 'unknown',
      };
    },
    getChapters: async (manga): Promise<Chapter[]> => {
      const { document, url } = await fetchDocument(BASE_URL + manga.url);
      const uploadedAt = parseDate(document.selectFirst('.article-info > small')?.text(), 'HH:mm dd-MM-yyyy');
      const base = relativeUrl(url);
      if (!splitPages()) return [{ url: base, name: 'Gallery', number: 0, uploadedAt }];
      const chapters: Chapter[] = [];
      for (let page = lastPageNumber(document); page >= 1; page--) {
        chapters.push({ url: withPage(base, page), name: `Page ${page}`, number: page, uploadedAt });
      }
      return chapters;
    },
    getPages: async (chapter): Promise<Page[]> => {
      const { document, url } = await fetchDocument(BASE_URL + chapter.url);
      const urls = document.select(PAGE_SELECTOR).map((img) => img.absUrl('src') || '');
      if (splitPages()) return urls.map((imageUrl, index) => ({ index, imageUrl }));
      const base = url.replace(/[?&]page=\d+/, '');
      const rest = await Promise.all(
        Array.from({ length: Math.max(lastPageNumber(document) - 1, 0) }, async (_, i) => {
          const { document: next } = await fetchDocument(withPage(base, i + 2));
          return next.select(PAGE_SELECTOR).map((img) => img.absUrl('src') || '');
        }),
      );
      return [...urls, ...rest.flat()].map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => HEADERS,
    resolveUrl: (url) => (hostOf(url) === hostOf(BASE_URL) ? { url: relativeUrl(url), title: '' } : null),
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
