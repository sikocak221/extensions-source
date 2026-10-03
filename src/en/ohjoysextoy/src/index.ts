import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://www.ohjoysextoy.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string) {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return { url: response.url, document: html.load(response.body, { baseUrl: response.url }) };
}

const thumbs = (elements: HtmlElement[]): MangaSummary[] =>
  elements.flatMap((element) => {
    const link = element.selectFirst('.comicarchiveframe > a');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: (element.selectFirst('.comicthumbdate')?.text() ?? '').split(' by')[0]!,
        thumbnailUrl: link.selectFirst('img')?.absUrl('src') || undefined,
      },
    ];
  });

// Every post is one comic with a single chapter.
export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(page: number): Promise<MangaPage> {
      const { document } = await load(`/category/comic/page/${page}/`);
      return {
        items: thumbs(document.select('.comicthumbwrap')),
        hasNextPage: document.selectFirst('.pagenav-left a') != null,
      };
    },
    async getLatest(): Promise<MangaPage> {
      const { document } = await load('/');
      return { items: thumbs(document.select('#MattsRecentComicsBar > ul > div')), hasNextPage: false };
    },
    async search(query: string): Promise<MangaPage> {
      const { document } = await load(`/?s=${encodeURIComponent(query.trim())}`);
      const items = document
        .select('h2.post-title a')
        .map((a) => ({ url: relativeUrl(a.absUrl('href') || a.attr('href') || ''), title: a.text().split(' by')[0]! }));
      return { items, hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(manga.url);
      const meta = (property: string) => document.selectFirst(`meta[property="${property}"]`)?.attr('content') ?? '';
      const ogTitle = meta('og:title');
      let description = meta('og:description').split(/\s{6,}/)[0] ?? '';
      if (description) description += '...\n\n';
      const credits = document.select('.entry div.ui-tabs div a').map((a) => `${a.text()}: ${a.absUrl('href')}`);
      if (credits.length) description += `${credits.join('\n')}\n\n`;
      return {
        url: manga.url,
        title: ogTitle.split(' by')[0] || manga.title,
        author: ogTitle.includes('by ') ? ogTitle.slice(ogTitle.indexOf('by ') + 3) : undefined,
        description: `${description}(Full description and credits in WebView)`,
        genres: document
          .select('meta[property="article:section"]')
          .slice(1)
          .map((m) => m.attr('content') ?? ''),
        status: 'completed',
        thumbnailUrl: meta('og:image') || manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { url, document } = await load(manga.url);
      return [
        {
          url: relativeUrl(url),
          name: document.selectFirst('title')?.text() ?? manga.title,
          scanlator: document.selectFirst('.post-author a')?.text() || undefined,
          uploadedAt: parseDate(document.selectFirst('.post-date')?.text(), 'M/d/yyyy'),
        },
      ];
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document } = await load(chapter.url);
      return document
        .select('div.comicpane img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.attr('src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
