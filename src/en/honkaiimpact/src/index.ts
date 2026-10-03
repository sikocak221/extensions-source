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

const BASE_URL = 'https://manga.honkaiimpact3.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

async function catalogue(query = ''): Promise<MangaPage> {
  const document = await load('/book');
  const q = query.trim().toLowerCase();
  const items = document
    .select('a[href*=book]')
    .map((a) => ({
      url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
      title: a
        .select('.container-title')
        .map((e) => e.text())
        .join(' '),
      thumbnailUrl: a.selectFirst('.container-cover img')?.absUrl('src') || undefined,
    }))
    .filter((m) => m.title && m.url !== '/book' && (!q || m.title.toLowerCase().includes(q)));
  return { items, hasNextPage: false };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: () => catalogue(),
    search: (query) => catalogue(query),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      return {
        url: manga.url,
        title:
          document
            .select('div.title')
            .map((e) => e.text())
            .join(' ') || manga.title,
        thumbnailUrl: document.selectFirst('img.cover')?.absUrl('src') || manga.thumbnailUrl,
        description:
          document
            .select('div.detail_info1')
            .map((e) => e.text())
            .join(' ') || undefined,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const data = (
        await http.get<{ title: string; bookid: number; chapterid: number; timestamp: string }[]>(
          `${BASE_URL}${manga.url}/get_chapter`,
          { headers, responseType: 'json' },
        )
      ).body;
      return data.map((c) => ({
        url: `/book/${c.bookid}/${Math.trunc(c.chapterid)}`,
        name: c.title,
        number: c.chapterid,
        uploadedAt: parseDate(c.timestamp, 'yyyy-MM-dd HH:mm:ss'),
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      return document
        .select('img.lazy.comic_img')
        .map((img) => img.attr('data-original') ?? '')
        .filter(Boolean)
        .map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/book\/\d+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
