import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, parseDate } from './common/utils';
import { type HtmlElement } from '@matane/extension-sdk';

const BASE_URL = 'https://comic.bh3.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

interface ChapterDto {
  title: string;
  bookid: number;
  chapterid: number;
  timestamp: string;
}

async function listBooks(): Promise<MangaPage> {
  const document = await load('/book');
  const items = document.select('a[href*="book"]').map((element) => ({
    url: `/book/${element.selectFirst('div.container')?.attr('id') ?? ''}`,
    title: element.selectFirst('div.container-title')?.text() ?? '',
    thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined,
  }));
  return { items, hasNextPage: false };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async () => listBooks(),
    // The site has no search: filter the (short) list of books.
    async search(query): Promise<MangaPage> {
      const needle = query.trim().toLowerCase();
      const { items } = await listBooks();
      return { items: items.filter((m) => m.title.toLowerCase().includes(needle)), hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      return {
        url: manga.url,
        title: document.selectFirst('div.title')?.text() || manga.title,
        thumbnailUrl: document.selectFirst('img.cover')?.absUrl('src') || manga.thumbnailUrl,
        description: document.selectFirst('div.detail_info1')?.text() || undefined,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const response = await http.get<ChapterDto[]>(absoluteUrl(BASE_URL, `${manga.url}/get_chapter`), {
        headers,
        responseType: 'json',
      });
      return response.body.map((dto) => ({
        url: `/book/${dto.bookid}/${dto.chapterid}`,
        name: dto.title,
        number: dto.chapterid,
        uploadedAt: parseDate(dto.timestamp, 'yyyy-MM-dd HH:mm:ss'),
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      return document
        .select('img.lazy.comic_img')
        .map((img, index) => ({ index, imageUrl: img.attr('data-original') ?? '' }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)(\/book\/\d+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase() !== hostOf(BASE_URL)) return null;
      return { url: match[2]!, title: '' };
    },
  }),
});
