import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://www.311s.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function parseManga(document: HtmlElement): MangaPage {
  const items = document.select('div.comic-list > div.comic-item').flatMap((element): MangaSummary[] => {
    const link = element.selectFirst('a');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: element.selectFirst('h3 a')?.text() ?? '',
        thumbnailUrl: element.selectFirst('img')?.attr('src') || undefined,
      },
    ];
  });
  const next = document.selectFirst('div.pagination > a.next')?.attr('href');
  const current = document.selectFirst('div.pagination > a.on')?.attr('href');
  return { items, hasNextPage: next !== undefined && next !== current };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => parseManga(await load(`/category/order/hits/page/${page}`)),
    getLatest: async (page) => parseManga(await load(`/category/order/addtime/page/${page}`)),
    search: async (query, page) => parseManga(await load(`/search/${query}/${page}`)),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const tags = document.select('div.comic-meta-info > div.comic-tags > span');
      const statusText = tags[tags.length - 1]?.text();
      const status: MangaStatus =
        statusText === '连载' || statusText === '连载中'
          ? 'ongoing'
          : statusText === '完结' || statusText === '已完结'
            ? 'completed'
            : 'unknown';
      return {
        url: manga.url,
        title: document.selectFirst('div.comic-meta-info > h1')?.text() || manga.title,
        thumbnailUrl: document.selectFirst('div.comic-cover-large > img')?.absUrl('src') || manga.thumbnailUrl,
        author:
          selectIgnoreCase(document, 'div.comic-stats > div.stat-item')
            .find((e) => e.text().includes('作者：'))
            ?.text()
            .replace(/^作者：/, '') || undefined,
        genres: tags[0]?.text().split(' ').filter(Boolean),
        description: document.selectFirst('div.comic-description > p')?.text() || undefined,
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      return document
        .select('#chapter-list > div.chapter-item > a')
        .map((element) => ({
          url: relativeUrl(element.absUrl('href') || element.attr('href') || ''),
          name: element.text(),
        }))
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      return document
        .select('div.comic-content > img')
        .map((img, index) => ({ index, imageUrl: img.attr('src') ?? '' }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)(\/comic_[^?#]*)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase().replace(/^www\./, '') !== hostOf(BASE_URL).replace(/^www\./, ''))
        return null;
      return { url: match[2]!, title: '' };
    },
  }),
});
