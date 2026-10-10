import {
  type Chapter,
  type Filter,
  type HtmlElement,
  type MangaPage,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://meijuntu.com';
const HEADERS = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const CATEGORIES: [string, string][] = [
  ['beauty', '6'],
  ['handsome', '5'],
  ['news', '30'],
  ['street', '32'],
];
const SORTS: [string, string][] = [
  ['default', 'index'],
  ['hot', 'hot'],
];

async function fetchDocument(url: string): Promise<{ document: HtmlElement; url: string }> {
  const response = await http.get(url, { headers: HEADERS });
  return { document: html.load(response.body, { baseUrl: response.url }), url: response.url };
}

async function parseMangaList(url: string): Promise<MangaPage> {
  const { document } = await fetchDocument(url);
  const items = document.select('.pic-list > ul > li').map((element) => ({
    url: relativeUrl(element.selectFirst('a')?.absUrl('href') ?? ''),
    title: element
      .select('p')
      .map((p) => p.text())
      .join(' '),
    thumbnailUrl: element.selectFirst('img')?.absUrl('src'),
  }));
  return { items: items.filter((m) => m.url), hasNextPage: document.selectFirst('span + a + a') !== null };
}

function imageOf(img: HtmlElement | null | undefined): string | undefined {
  if (!img) return undefined;
  for (const name of ['data-original', 'data-src', 'data-lazy-src', 'src']) {
    const value = img.absUrl(name);
    if (value) return value;
  }
  return undefined;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => parseMangaList(`${BASE_URL}/beauty/hot-${page}.html`),
    getLatest: (page) => parseMangaList(`${BASE_URL}/beauty/index-${page}.html`),
    search: (query, page, filters) => {
      const str = (id: string): string => (typeof filters[id] === 'string' ? (filters[id] as string) : '');
      const category = CATEGORIES.find(([name]) => name === str('category'));
      const sort = SORTS.find(([, value]) => value === str('sort'));
      let url: string;
      if (query) url = `${BASE_URL}/search/${encodeURIComponent(query)}-${page}.html`;
      else if (str('tag')) url = `${BASE_URL}/tags/${str('tag')}-${category?.[1] ?? '6'}-${page}.html`;
      else if (str('model')) url = `${BASE_URL}/model/${str('model')}-${page}.html`;
      else if (str('group')) url = `${BASE_URL}/xzjg/${str('group')}-${page}.html`;
      else if (category && str('category') !== 'beauty')
        url = `${BASE_URL}/${category[0]}/${sort?.[1] ?? 'index'}-${page}.html`;
      else if (sort && sort[1] !== 'index') url = `${BASE_URL}/${category?.[0] ?? 'beauty'}/${sort[1]}-${page}.html`;
      else url = `${BASE_URL}/beauty/index-${page}.html`;
      return parseMangaList(url);
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'NOTE: Ignored if using text search!' },
      { type: 'header', label: 'NOTE: Filter are weird for this extension!' },
      { type: 'separator' },
      { type: 'text', id: 'tag', label: 'Tag' },
      { type: 'text', id: 'model', label: 'Model' },
      { type: 'text', id: 'group', label: 'Group' },
      {
        type: 'select',
        id: 'category',
        label: 'Category',
        options: CATEGORIES.map(([label]) => ({ label, value: label })),
      },
      { type: 'select', id: 'sort', label: 'Sort', options: SORTS.map(([label, value]) => ({ label, value })) },
    ],
    getMangaDetails: async (manga) => {
      const { document } = await fetchDocument(BASE_URL + manga.url);
      const info = document
        .select('.news-info, .picture-details')
        .map((e) => e.text())
        .join(' ');
      const description = `${info}\n${document
        .select('.introduce')
        .map((e) => e.text())
        .join(' ')}`;
      return {
        url: manga.url,
        title: document.selectFirst('.news-title, .title')?.text() || manga.title,
        thumbnailUrl: manga.thumbnailUrl,
        description,
        genres: document.select('.relation_tags > a').map((a) => a.text()),
        status: 'completed',
      };
    },
    getChapters: async (manga): Promise<Chapter[]> => {
      const { document, url } = await fetchDocument(BASE_URL + manga.url);
      const href = document.selectFirst('.position a:last-child')?.absUrl('href');
      const dateText = document
        .select('.base-info span:contains(日期)')
        .map((e) => e.text())
        .join(' ');
      const date = dateText.split('日期:')[1]?.trim();
      return [{ url: relativeUrl(href || url), name: 'Gallery', uploadedAt: parseDate(date, 'yyyy-MM-dd') }];
    },
    getPages: async (chapter): Promise<Page[]> => {
      const response = await http.get(BASE_URL + chapter.url, { headers: HEADERS });
      const document = html.load(response.body, { baseUrl: response.url });
      const finalUrl = response.url;
      const pages: Page[] = [];

      const newsBody = document.selectFirst('.news-body');
      if (newsBody) {
        return newsBody.select('img').map((img, index) => ({ index, imageUrl: imageOf(img) }));
      }

      const pagesText = document
        .select('.pages > a:nth-last-of-type(2)')
        .map((a) => a.text())
        .join('');
      const numbers = document
        .select('.pages a')
        .map((a) => Number.parseInt(a.text(), 10))
        .filter((n) => !Number.isNaN(n));
      const numPages = Number.parseInt(pagesText, 10) || (numbers.length ? Math.max(...numbers) : 1);

      const path = finalUrl.replace(/^https?:\/\/[^/]+/, '').split(/[?#]/)[0]!;
      const segments = path.split('/').filter(Boolean);
      const file = segments[segments.length - 1] ?? '';
      const slug = file.replace(/\.html$/, '').replace(/-[^-]*$/, '');
      const script = document
        .select('script')
        .map((s) => s.html())
        .find((h) => h.includes('pc_cid'));

      if (script) {
        const categoryId = script.split('pc_cid = ')[1]?.split(';')[0]?.trim() ?? '';
        const contentId = script.split('pc_id = ')[1]?.split(';')[0]?.trim() ?? '';
        const cat = segments[0] ?? 'beauty';
        const origin = finalUrl.replace(/^(https?:\/\/[^/]+).*$/, '$1');
        const ajaxPage = (n: number): string =>
          `${origin}/ajax_${cat}/${slug}-${n}.html?ajax=1&catid=${encodeURIComponent(categoryId)}&conid=${encodeURIComponent(contentId)}`;
        const first = imageOf(document.selectFirst('.pictures img'));
        pages.push(first ? { index: 0, imageUrl: first } : { index: 0, url: ajaxPage(1) });
        for (let i = 2; i <= numPages; i++) pages.push({ index: i - 1, url: ajaxPage(i) });
      } else {
        const origin = finalUrl.replace(/^(https?:\/\/[^/]+).*$/, '$1');
        const dir = segments.slice(0, -1).join('/');
        for (let i = 1; i <= numPages; i++) {
          pages.push({ index: i - 1, url: `${origin}/${dir}/${slug}${i > 1 ? `-${i}` : ''}.html` });
        }
      }
      return pages;
    },
    getImageUrl: async (page) => {
      const response = await http.get<string>(page.url ?? '', { headers: HEADERS });
      if (/application\/json/i.test(response.headers['content-type'] ?? '') || /[?&]ajax=1/.test(response.url)) {
        const data = JSON.parse(response.body) as { pic: string };
        const img = html.load(data.pic, { baseUrl: BASE_URL }).selectFirst('img');
        const src = img?.absUrl('src') || img?.attr('src');
        if (!src) throw new Error('Image not found in AJAX response');
        return src;
      }
      const document = html.load(response.body, { baseUrl: response.url });
      const image = imageOf(document.selectFirst('.pictures img'));
      if (!image) throw new Error('Image not found in HTML response');
      return image;
    },
    imageHeaders: () => HEADERS,
    resolveUrl: (url) => (hostOf(url) === hostOf(BASE_URL) ? { url: relativeUrl(url), title: '' } : null),
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
