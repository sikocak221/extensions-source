import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://xlecx.one';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.request<string>({ url: absoluteUrl(BASE_URL, url), headers });
  const document = html.load(response.body, { baseUrl: response.url });
  if (response.status === 403) {
    const message = document.selectFirst('.message-info__content')?.text().replace(/\s+/g, ' ');
    throw new Error(message ? (message.length > 200 ? 'Open the website to see its message' : message) : 'HTTP 403');
  }
  if (response.status >= 400) throw new Error(`HTTP ${response.status}`);
  return document;
}

async function list(url: string): Promise<MangaPage> {
  const document = await load(url);
  const items = document.select('#dle-content > a.thumb').map((a) => {
    const img = a.selectFirst('img');
    return {
      url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
      title: img?.attr('alt') ?? '',
      thumbnailUrl: img?.absUrl('src') || undefined,
    };
  });
  return {
    items,
    hasNextPage: document.select('#pagination > .pagination__pages > a').some((a) => a.text().includes('Next')),
  };
}

const paged = (page: number) => (page > 1 ? `page/${page}/` : '');
const jsonLd = (document: HtmlElement) => {
  const data = document.selectFirst('script[type="application/ld+json"]')?.html();
  return data
    ? (JSON.parse(data) as { '@graph'?: { datePublished: string; dateModified?: string; image: string[] }[] })[
        '@graph'
      ]?.[0]
    : undefined;
};

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`/f/sort=news_read/order=desc/${paged(page)}`),
    getLatest: (page) => list(`/f/sort=date/order=desc/${paged(page)}`),
    search: (query, page) =>
      list(
        `/index.php?do=search&subaction=search&search_start=${page}&full_search=0&story=${encodeURIComponent(query.trim())}`,
      ),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      // "Artist:" labels are followed by their links.
      const info = (label: string) => {
        const html =
          document
            .select('.page__subinfo-item')
            .map((e) => e.html())
            .find((h) => h.includes(label)) ?? '';
        return [...html.matchAll(/<a[^>]*>([^<]*)<\/a>/g)].map((m) => m[1]!.trim()).join(', ') || undefined;
      };
      return {
        url: manga.url,
        title: document.selectFirst('h1')?.text() || manga.title,
        artist: info('Artist:'),
        author: info('Group:'),
        genres: info('Tags:')?.split(', '),
        thumbnailUrl: document.selectFirst('meta[property="og:image"]')?.absUrl('content') || manga.thumbnailUrl,
        status: 'completed',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const book = jsonLd(await load(manga.url));
      const time = Date.parse(book?.dateModified ?? book?.datePublished ?? '');
      return [{ url: manga.url, name: 'Chapter', number: 1, uploadedAt: Number.isFinite(time) ? time : undefined }];
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      const imgs = (selector: string) =>
        document
          .select(selector)
          .map((img) => img.absUrl('data-src') || img.absUrl('src') || '')
          .filter(Boolean);
      let urls = imgs('#content-2 > .imagegall23 > img');
      if (!urls.length)
        urls = document
          .select('.page__text a:has(img)')
          .map((a) => a.absUrl('href') || '')
          .filter(Boolean);
      if (!urls.length) urls = imgs('#content-1 > .imagegall23 > img');
      if (!urls.length) urls = jsonLd(document)?.image ?? [];
      return urls.map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/\d+-[^?#]*?\.html)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
