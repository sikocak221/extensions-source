import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, imgAttr, relativeUrl } from './common/utils';

const BASE_URL = 'https://www.hentai-archive.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const imageHeaders = { ...headers, Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(page): Promise<MangaPage> {
      const document = await load(`/category/hentai-recenti/page/${page}`);
      const items = document.select('div.posts-container article').flatMap((element): MangaSummary[] => {
        const link = element.selectFirst('a.entire-meta-link');
        if (!link) return [];
        return [
          {
            url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
            title: element.selectFirst('span.screen-reader-text')?.text() ?? '',
            thumbnailUrl:
              element.selectFirst('span.post-featured-img img.wp-post-image')?.absUrl('data-nectar-img-src') ||
              undefined,
          },
        ];
      });
      return { items, hasNextPage: document.selectFirst('nav#pagination a.next.page-numbers') != null };
    },
    async search(query, page): Promise<MangaPage> {
      const document = await load(`/page/${page}/?s=${encodeURIComponent(query)}`);
      const items = document.select('article.result').flatMap((element): MangaSummary[] => {
        const link = element.selectFirst('h2.title a');
        if (!link) return [];
        return [
          {
            url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
            title: link.text(),
            thumbnailUrl: element.selectFirst('a img.wp-post-image')?.absUrl('src') || undefined,
          },
        ];
      });
      return { items, hasNextPage: document.selectFirst('a.next.page-numbers') != null };
    },
    async getMangaDetails(manga): Promise<MangaDetails> {
      const document = await load(manga.url);
      const main = document.selectFirst('div.main-content');
      // The genres are the css classes of the category links ("hentai-tette-grosse" → "tette grosse").
      const genres = (main?.select('.meta-category a') ?? [])
        .flatMap((a) => (a.attr('class') ?? '').split(/\s+/))
        .map((name) => name.replace(/-/g, ' ').replace('hentai', '').trim())
        .filter(Boolean);
      return {
        url: manga.url,
        title: main?.selectFirst('h1')?.text() || manga.title,
        genres: genres.length ? genres : undefined,
        status: 'completed',
        thumbnailUrl: manga.thumbnailUrl,
      };
    },
    // Every post is a single chapter.
    async getChapters(manga): Promise<Chapter[]> {
      return [{ url: manga.url, name: 'Chapter', number: 1 }];
    },
    async getPages(chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      return document
        .select('div.content-inner img:not(.sp-banner img)')
        .map((img) => (imgAttr(img) || '').replace(/-(\d+x\d+)(?=\.jpg)/, ''))
        .filter(Boolean)
        .map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => imageHeaders,
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)(\/[^?#]+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase().replace(/^www\./, '') !== hostOf(BASE_URL).replace(/^www\./, ''))
        return null;
      return { url: match[2]!, title: '' };
    },
  }),
});
