import {
  type Chapter,
  type Filter,
  type HtmlElement,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, ownText } from './common/utils';
import { GENRES, LANGUAGES, RELEASES, TAGS } from './filters';

const BASE_URL = 'https://hentailoop.com';
const HEADERS = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const SORTS: [string, string][] = [
  ['Views', 'views'],
  ['Date', 'date'],
  ['Likes', 'likes'],
  ['Dislikes', 'dislikes'],
];

const mangaPath = (slug: string): string => `/manga/${slug}/`;
const slugOf = (url: string): string =>
  url
    .replace(/^https?:\/\/[^/]+/, '')
    .split(/[?#]/)[0]!
    .split('/')
    .filter(Boolean)[1] ?? '';

function imgAttr(element: HtmlElement | null | undefined): string | undefined {
  if (!element) return undefined;
  const dataSrc = element.attr('data-src');
  if (dataSrc?.trim()) return element.absUrl('data-src');
  const src = element.attr('src');
  if (src?.trim()) return element.absUrl('src');
  return undefined;
}

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers: HEADERS });
  return html.load(response.body, { baseUrl: response.url });
}

function parseMangaList(document: HtmlElement): MangaPage {
  const items = document.select('div.manga-card a').map((element): MangaSummary => ({
    url: mangaPath(slugOf(element.absUrl('href') || element.attr('href') || '')),
    title: (element.selectFirst('.title') ? ownText(element.selectFirst('.title')) : '').trim(),
    thumbnailUrl: imgAttr(element.selectFirst('img.attachment-manga_thumb')),
  }));
  return {
    items: items.filter((m) => m.url && m.title),
    hasNextPage: document.selectFirst('nav.navigation a.next') !== null,
  };
}

async function getMangaList(directory: string, slug: string | null, sort: string, page: number): Promise<MangaPage> {
  let url = `${BASE_URL}/${directory}/`;
  if (slug) url += `${slug}/`;
  if (page > 1) url += `page/${page}/`;
  return parseMangaList(await fetchDocument(`${url}?sortmanga=${sort}`));
}

async function quickSearch(query: string): Promise<MangaPage> {
  const response = await http.post<{ data: { posts: { title: string; thumb: string; link: string }[] } }>(
    `${BASE_URL}/wp-admin/admin-ajax.php`,
    { form: { action: 'nativeSearch', subAction: 'search', query: query.trim() } },
    { headers: { ...HEADERS, 'X-Requested-With': 'XMLHttpRequest' }, responseType: 'json' },
  );
  const items = response.body.data.posts.map((post) => ({
    url: mangaPath(slugOf(post.link)),
    title: post.title,
    thumbnailUrl: post.thumb,
  }));
  return { items, hasNextPage: false };
}

const options = (list: [string, string][], first?: string) => [
  ...(first === undefined ? [] : [{ label: first, value: '' }]),
  ...list.map(([label, value]) => ({ label, value })),
];

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => getMangaList('manga', null, 'views', page),
    getLatest: (page) => getMangaList('manga', null, 'date', page),
    search: async (query, page, filters) => {
      const sort = typeof filters.sort === 'string' && filters.sort ? filters.sort : 'views';
      const pick = (id: string): string => (typeof filters[id] === 'string' ? (filters[id] as string) : '');
      const genres = GENRES.filter(([, slug]) => filters[`genre.${slug}`] === true).map(([, slug]) => slug);
      const active: [string, string][] = [];
      if (pick('release')) active.push(['releases', pick('release')]);
      if (pick('language')) active.push(['languages', pick('language')]);
      if (pick('tag')) active.push(['tag', pick('tag')]);
      if (genres.length === 1) active.push(['genres', genres[0]!]);
      if (active.length > 1 || genres.length > 1) {
        throw new Error('Only one filter can be combined (advanced search needs a captcha in the browser)');
      }
      if (query.trim()) {
        if (active.length === 0) return quickSearch(query);
        throw new Error('Text search cannot be combined with filters');
      }
      const [directory, slug] = active[0] ?? ['manga', null];
      return getMangaList(directory, slug, sort, page);
    },
    getFilters: (): Filter[] => [
      { type: 'select', id: 'sort', label: 'Sort', options: options(SORTS), default: 'views' },
      { type: 'header', label: 'Only one of the filters below can be used at a time' },
      { type: 'select', id: 'release', label: 'Release', options: options(RELEASES, '') },
      { type: 'select', id: 'language', label: 'Language', options: options(LANGUAGES, '') },
      { type: 'select', id: 'tag', label: 'Tag', options: options(TAGS, '') },
      {
        type: 'group',
        id: 'genres',
        label: 'Genre',
        filters: GENRES.map(([label, slug]) => ({ type: 'checkbox', id: `genre.${slug}`, label })),
      },
    ],
    getMangaDetails: async (manga) => {
      const document = await fetchDocument(BASE_URL + manga.url);
      const lines: string[] = [];
      const subtitle = document.selectFirst('.manga-subtitle')?.text();
      if (subtitle) lines.push(`Alternative Name: ${subtitle}`);
      for (const selector of ['.pre-meta .counter', '.pre-meta .manga-views', '.pre-meta .manga-updated']) {
        const text = document.selectFirst(selector)?.text();
        if (text) lines.push(text);
      }
      const likes = document.selectFirst('.rating-buttons span#likes')?.text();
      if (likes) lines.push(`Dislikes: ${likes}`);
      const dislikes = document.selectFirst('.rating-buttons span#dislikes')?.text();
      if (dislikes) lines.push(`Likes: ${dislikes}`);
      const artists = document
        .select('.manga-term-content a[href*="/artists/"]')
        .map((a) => a.text())
        .join(', ');
      const genres = ['/genres/', '/languages/', '/tag/'].flatMap((part) =>
        document.select(`.manga-term-content a[href*="${part}"]`).map((a) => a.text()),
      );
      return {
        url: manga.url,
        title: document.selectFirst('.manga-title')?.text() ?? manga.title,
        thumbnailUrl: imgAttr(document.selectFirst('.manga-thumb img')) ?? manga.thumbnailUrl,
        author: artists || undefined,
        artist: artists || undefined,
        description: lines.join('\n'),
        genres,
        status: 'completed',
      };
    },
    getChapters: async (manga): Promise<Chapter[]> => {
      const response = await http.get(BASE_URL + manga.url, { headers: HEADERS });
      const document = html.load(response.body, { baseUrl: response.url });
      const ld = document.selectFirst('.yoast-schema-graph[type="application/ld+json"]')?.html();
      let date: number | undefined;
      try {
        const graph = (JSON.parse(ld ?? '{}') as { '@graph'?: { datePublished?: string }[] })['@graph'] ?? [];
        const published = graph.find((item) => item.datePublished)?.datePublished;
        const time = published ? Date.parse(published) : Number.NaN;
        date = Number.isNaN(time) ? undefined : time;
      } catch {
        date = undefined;
      }
      return [{ url: manga.url, name: 'Chapter', uploadedAt: date }];
    },
    getPages: async (chapter): Promise<Page[]> => {
      const document = await fetchDocument(`${BASE_URL}${chapter.url}read/`);
      return document.select('.gallery-item > dt > img').map((img, index) => ({ index, imageUrl: imgAttr(img) }));
    },
    imageHeaders: () => HEADERS,
    resolveUrl: (url) => {
      if (hostOf(url) !== hostOf(BASE_URL) || !/^https?:\/\/[^/]+\/manga\/[^/?#]+/.test(url)) return null;
      return { url: mangaPath(slugOf(url)), title: '' };
    },
    getWebUrl: (item) => `${BASE_URL}${item.url}${'name' in item ? 'read/' : ''}`,
  }),
});
