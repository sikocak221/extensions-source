import {
  type Chapter,
  type Filter,
  type FilterOption,
  type HtmlElement,
  type MangaPage,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, parseDate, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://cosplaytele.com';
const HEADERS = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const POPULAR_LIMIT = 20;
const TAG_PATTERN = /.*\/(tag|category)\/.*/;
const CATEGORIES: FilterOption[] = [
  { label: 'All', value: '' },
  { label: 'Cosplay Nude', value: 'category/nude' },
  { label: 'Cosplay Ero', value: 'category/no-nude' },
  { label: 'Cosplay', value: 'category/cosplay' },
];

interface PopularPost {
  title: { rendered: string };
  link: string;
  _embedded?: { 'wp:featuredmedia'?: { source_url: string }[] };
}

async function fetchDocument(url: string): Promise<{ document: HtmlElement; url: string }> {
  const response = await http.get(url, { headers: HEADERS });
  return { document: html.load(response.body, { baseUrl: response.url }), url: response.url };
}

function parseMangaList(document: HtmlElement): MangaPage {
  const items = document.select('main div.box').flatMap((element) => {
    const link = element.selectFirst('h5 a');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: link.text(),
        thumbnailUrl: element.selectFirst('img')?.absUrl('src'),
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('.next.page-number') !== null };
}

function getTags(document: HtmlElement): { name: string; path: string }[] {
  return document
    .select('#main a')
    .filter((a) => TAG_PATTERN.test(a.absUrl('href') || ''))
    .map((a) => ({ name: a.text(), path: relativeUrl(a.absUrl('href') || '').replace(/^\//, '') }));
}

async function getLatest(page: number): Promise<MangaPage> {
  return parseMangaList((await fetchDocument(`${BASE_URL}/page/${page}/`)).document);
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page): Promise<MangaPage> => {
      const url = withQuery(`${BASE_URL}/wp-json/wordpress-popular-posts/v1/popular-posts`, {
        offset: String((page - 1) * POPULAR_LIMIT),
        limit: String(POPULAR_LIMIT),
        range: 'last7days',
        embed: 'true',
        _embed: 'wp:featuredmedia',
        _fields: 'title,link,_embedded,_links.wp:featuredmedia',
      });
      const response = await http.get<PopularPost[]>(url, { headers: HEADERS, responseType: 'json' });
      const items = response.body.map((item) => ({
        url: relativeUrl(item.link),
        title: html.load(`<p>${item.title.rendered}</p>`).text(),
        thumbnailUrl: item._embedded?.['wp:featuredmedia']?.[0]?.source_url,
      }));
      return { items, hasNextPage: items.length >= POPULAR_LIMIT };
    },
    getLatest,
    search: async (query, page, filters) => {
      const category = typeof filters.category === 'string' ? filters.category : '';
      let url: string;
      if (category) {
        url = `${BASE_URL}/${category}/page/${page}`;
        if (query) url = withQuery(url, { s: query });
      } else if (query) url = withQuery(`${BASE_URL}/page/${page}/`, { s: query });
      else return getLatest(page);
      return parseMangaList((await fetchDocument(url)).document);
    },
    getFilters: async (): Promise<Filter[]> => {
      const options = [...CATEGORIES];
      try {
        const { document } = await fetchDocument(`${BASE_URL}/explore-categories/`);
        for (const tag of getTags(document)) {
          if (tag.name && !options.some((o) => o.value === tag.path))
            options.push({ label: tag.name, value: tag.path });
        }
      } catch {
        // keep the static categories
      }
      return [
        { type: 'header', label: 'NOTE: Only one filter will be applied!' },
        { type: 'separator' },
        { type: 'select', id: 'category', label: 'Category', options },
      ];
    },
    getMangaDetails: async (manga) => {
      const { document } = await fetchDocument(BASE_URL + manga.url);
      const title = document.selectFirst('.entry-title')?.text();
      if (!title) throw new Error('Title is mandatory');
      return {
        url: manga.url,
        title,
        thumbnailUrl: manga.thumbnailUrl,
        description: title,
        genres: getTags(document).map((t) => t.name),
        status: 'completed',
      };
    },
    getChapters: async (manga): Promise<Chapter[]> => {
      const { document, url } = await fetchDocument(BASE_URL + manga.url);
      const datetime = document.selectFirst('time.updated')?.attr('datetime');
      return [
        {
          url: relativeUrl(url),
          name: 'Gallery',
          uploadedAt: parseDate(datetime?.split('T')[0], 'yyyy-MM-dd'),
        },
      ];
    },
    getPages: async (chapter): Promise<Page[]> => {
      const { document } = await fetchDocument(BASE_URL + chapter.url);
      return document
        .select('.gallery-item img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.attr('src') }));
    },
    imageHeaders: () => HEADERS,
    resolveUrl: (url) =>
      hostOf(url).replace(/^www\./, '') === 'cosplaytele.com' ? { url: relativeUrl(url), title: '' } : null,
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
