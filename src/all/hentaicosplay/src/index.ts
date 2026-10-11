import {
  type Chapter,
  type Filter,
  type HtmlElement,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://hentai-cosplay-xxx.com';
const HEADERS = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const dateCache = new Map<string, string>();

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers: HEADERS });
  return html.load(response.body, { baseUrl: response.url });
}

const https = (url: string | undefined): string | undefined => url?.replace('http://', 'https://');

function parseListing(document: HtmlElement): MangaPage {
  const items: MangaSummary[] = [];
  let hasNextPage: boolean;
  if (document.selectFirst('div.image-list-item') === null) {
    for (const element of document.select('#entry_list > li > a[href*="/image/"]')) {
      const url = relativeUrl(element.absUrl('href') || element.attr('href') || '');
      items.push({
        url,
        title: element.selectFirst('span:not(.posted)')?.text() ?? '',
        thumbnailUrl: https(element.selectFirst('img')?.absUrl('src')),
      });
      const posted = element.selectFirst('span.posted')?.text();
      if (posted) dateCache.set(url, posted);
    }
    hasNextPage = document.selectFirst('a.paginator_page[rel=next]') !== null;
  } else {
    for (const element of document.select('div.image-list-item:has(a[href*="/image/"])')) {
      const link = element.selectFirst('a');
      const url = relativeUrl(link?.absUrl('href') || link?.attr('href') || '');
      items.push({
        url,
        title: element
          .select('.image-list-item-title')
          .map((e) => e.text())
          .join(' '),
        thumbnailUrl: https(element.selectFirst('img')?.absUrl('src')),
      });
      const posted = element.selectFirst('.image-list-item-regist-date')?.text();
      if (posted) dateCache.set(url, posted);
    }
    hasNextPage = document.selectFirst('div.wp-pagenavi > a[rel=next]') !== null;
  }
  return { items: items.filter((m) => m.url), hasNextPage };
}

const listing = async (path: string): Promise<MangaPage> => parseListing(await fetchDocument(BASE_URL + path));

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => listing(`/ranking/page/${page}/`),
    getLatest: (page) => listing(`/search/page/${page}/`),
    search: (query, page, filters) => {
      if (query.trim()) return listing(`/search/keyword/${query.trim().replace(/ /g, '+')}/page/${page}/`);
      const tag = typeof filters.tag === 'string' ? filters.tag : '';
      return listing(tag ? `${tag}page/${page}/` : `/search/page/${page}/`);
    },
    getFilters: async (): Promise<Filter[]> => {
      const options = [{ label: '', value: '' }];
      try {
        const document = await fetchDocument(`${BASE_URL}/ranking-tag/`);
        for (const a of document.select('#tags a')) {
          options.push({
            label: a
              .text()
              .replace(/\(\d+\)/, '')
              .trim(),
            value: a.attr('href') ?? '',
          });
        }
      } catch {
        // no tags available
      }
      return [
        { type: 'header', label: 'Ignored with text search' },
        { type: 'separator' },
        { type: 'select', id: 'tag', label: 'Ranked Tags', options },
      ];
    },
    getMangaDetails: async (manga) => {
      const document = await fetchDocument(BASE_URL + manga.url);
      return {
        url: manga.url,
        title: manga.title,
        thumbnailUrl: manga.thumbnailUrl,
        genres: document.select('#detail_tag a[href*="/tag/"]').map((a) => a.text()),
        status: 'completed',
      };
    },
    getChapters: async (manga): Promise<Chapter[]> => [
      {
        url: manga.url.replace('/image/', '/story/'),
        name: 'Gallery',
        uploadedAt: parseDate(dateCache.get(manga.url), 'yyyy/M/d'),
      },
    ],
    getPages: async (chapter): Promise<Page[]> => {
      const document = await fetchDocument(BASE_URL + chapter.url);
      return document
        .select('amp-img[src*=upload]:not(.related-thumbnail)')
        .map((element, index) => ({ index, imageUrl: element.attr('src') }));
    },
    imageHeaders: () => HEADERS,
    resolveUrl: (url) => (hostOf(url) === hostOf(BASE_URL) ? { url: relativeUrl(url), title: '' } : null),
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
