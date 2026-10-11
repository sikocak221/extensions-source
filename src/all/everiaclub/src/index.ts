import {
  type Chapter,
  type Filter,
  type FilterOption,
  type HtmlElement,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, decodeEntities, hostOf, parseDate, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://everia.club';
const HEADERS = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const DEFAULT_CATEGORIES: FilterOption[] = [
  { label: 'Any', value: '' },
  { label: 'China', value: '42' },
  { label: 'Cosplay', value: '7' },
  { label: 'Japan', value: '2' },
  { label: 'Korea', value: '11' },
  { label: 'Thailand', value: '1984' },
];

interface Post {
  link: string;
  title: { rendered: string };
  _embedded?: { 'wp:featuredmedia'?: { source_url: string }[] };
}
interface Term {
  id: number;
  name: string;
}

function imgSrc(element: HtmlElement | null | undefined): string {
  if (!element) return '';
  return element.absUrl('data-lazy-src') || element.absUrl('data-src') || element.absUrl('src') || '';
}

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers: HEADERS });
  return html.load(response.body, { baseUrl: response.url });
}

async function fetchPosts(params: Record<string, string>, page: number): Promise<MangaPage> {
  const url = withQuery(`${BASE_URL}/wp-json/wp/v2/posts`, {
    page: String(page),
    per_page: '20',
    _embed: 'wp:featuredmedia',
    ...params,
  });
  const response = await http.get<Post[]>(url, { headers: HEADERS, responseType: 'json' });
  const key = Object.keys(response.headers).find((k) => k.toLowerCase() === 'x-wp-totalpages');
  const totalPages = Number(key ? response.headers[key] : 0) || 0;
  const items = response.body.map((post): MangaSummary => ({
    url: relativeUrl(post.link),
    title: decodeEntities(post.title.rendered),
    thumbnailUrl: post._embedded?.['wp:featuredmedia']?.[0]?.source_url,
  }));
  return { items, hasNextPage: page < totalPages };
}

async function getTerms(path: string): Promise<Term[]> {
  const response = await http.get<Term[]>(`${BASE_URL}/wp-json/wp/v2/${path}`, {
    headers: HEADERS,
    responseType: 'json',
  });
  return response.body;
}

function parseImages(document: HtmlElement): string[] {
  return document.select('.entry-content img').map(imgSrc);
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async () => {
      const document = await fetchDocument(BASE_URL);
      const items = document.select('.wli_popular_posts-class li').map((element): MangaSummary => ({
        url: relativeUrl(element.selectFirst('h3 > a')?.absUrl('href') ?? ''),
        title: element.selectFirst('h3')?.text() ?? '',
        thumbnailUrl: imgSrc(element.selectFirst('img')) || undefined,
      }));
      return { items, hasNextPage: false };
    },
    getLatest: (page) => fetchPosts({}, page),
    search: (query, page, filters) => {
      const params: Record<string, string> = {};
      if (query) params.search = query;
      const category = filters.category;
      if (typeof category === 'string' && category) params.categories = category;
      const included: string[] = [];
      const excluded: string[] = [];
      for (const [key, value] of Object.entries(filters)) {
        if (!key.startsWith('tag.')) continue;
        if (value === 'include') included.push(key.slice(4));
        else if (value === 'exclude') excluded.push(key.slice(4));
      }
      if (included.length) params.tags = included.join(',');
      if (excluded.length) params.tags_exclude = excluded.join(',');
      return fetchPosts(params, page);
    },
    getFilters: async (): Promise<Filter[]> => {
      let categories = DEFAULT_CATEGORIES;
      let tags: Term[] = [];
      try {
        categories = [
          { label: 'Any', value: '' },
          ...(await getTerms('categories?per_page=100&hide_empty=true')).map((c) => ({
            label: c.name,
            value: String(c.id),
          })),
        ];
        tags = await getTerms('tags?per_page=100&hide_empty=true&orderby=count&order=desc');
      } catch {
        // fall back to the static categories
      }
      const filters: Filter[] = [
        { type: 'header', label: 'NOTE: Category filter can be combined with search.' },
        { type: 'separator' },
        { type: 'select', id: 'category', label: 'Category', options: categories },
      ];
      if (tags.length) {
        filters.push({
          type: 'group',
          id: 'tags',
          label: 'Tags',
          filters: tags.map((tag) => ({ type: 'tristate', id: `tag.${tag.id}`, label: decodeEntities(tag.name) })),
        });
      }
      return filters;
    },
    getMangaDetails: async (manga) => {
      const document = await fetchDocument(BASE_URL + manga.url);
      const title = document.selectFirst('.entry-title')?.text() || manga.title;
      return {
        url: manga.url,
        title,
        thumbnailUrl: manga.thumbnailUrl,
        description: title,
        genres: document.select('.post-tags > a').map((a) => a.text()),
        status: 'completed',
      };
    },
    getChapters: async (manga): Promise<Chapter[]> => {
      const response = await http.get(BASE_URL + manga.url, { headers: HEADERS });
      const document = html.load(response.body, { baseUrl: response.url });
      const canonical = document.selectFirst('link[rel="canonical"]')?.attr('href') || response.url;
      const date = /\d{4}\/\d{2}\/\d{2}/.exec(canonical)?.[0];
      return [{ url: relativeUrl(canonical), name: 'Gallery', number: -2, uploadedAt: parseDate(date, 'yyyy/MM/dd') }];
    },
    getPages: async (chapter): Promise<Page[]> => {
      const document = await fetchDocument(BASE_URL + chapter.url);
      const links = [
        ...new Set(document.select('.page-links a.post-page-numbers').map((a) => a.absUrl('href') || '')),
      ].filter(Boolean);
      let urls: string[];
      if (links.length === 0) {
        urls = parseImages(document);
      } else {
        const docs = await Promise.all(links.map((link) => fetchDocument(link).catch(() => null)));
        urls = [document, ...docs.filter((d): d is HtmlElement => d !== null)].flatMap(parseImages);
      }
      return [...new Set(urls)]
        .filter((url) => url && !url.startsWith('data:image'))
        .map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => HEADERS,
    resolveUrl: (url) => (hostOf(url) === hostOf(BASE_URL) ? { url: relativeUrl(url), title: '' } : null),
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
