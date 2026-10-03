import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://mangalay.blogspot.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

// A Blogger site with one hand-made index page; no search.

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

async function catalogue(): Promise<MangaSummary[]> {
  const document = await fetchDocument(`${BASE_URL}/2013/04/daftar-baca-komik_20.html`);
  return document.select('.post-body table').flatMap((element): MangaSummary[] => {
    const link = element.selectFirst('a');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: element
          .select('.tr-caption')
          .map((c) => c.text())
          .join(' '),
        thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined,
      },
    ];
  });
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    async getPopular(): Promise<MangaPage> {
      return { items: await catalogue(), hasNextPage: false };
    },

    // The site has no search: filter the catalogue by title.
    async search(query: string): Promise<MangaPage> {
      const q = query.trim().toLowerCase();
      return { items: (await catalogue()).filter((m) => m.title.toLowerCase().includes(q)), hasNextPage: false };
    },

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      return { ...manga, status: 'unknown' };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}`);
      return document.select('.post-body span > a').map((a) => ({
        url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
        name:
          a
            .select('b')
            .map((b) => b.text())
            .join(' ') || a.text(),
      }));
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await fetchDocument(`${BASE_URL}${chapter.url}`);
      // The last image is not a page.
      return document
        .select('.separator img')
        .slice(0, -1)
        .map((img) => img.absUrl('src') || img.attr('src') || '')
        .filter(Boolean)
        .map((imageUrl, index) => ({ index, imageUrl }));
    },

    imageHeaders: () => headers,

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/\d{4}\/\d{2}\/[^/?#]+\.html)/i.exec(url.trim());
      return match && match[1]?.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
