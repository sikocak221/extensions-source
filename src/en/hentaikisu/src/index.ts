import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, ownText, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://hentaikisu.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string) {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return { url: response.url, body: response.body, document: html.load(response.body, { baseUrl: response.url }) };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(page: number): Promise<MangaPage> {
      const data = (
        await http.get<{ id: string; title: string; img: string }[]>(
          `${BASE_URL}/backend/infinite.index.php?p=${page}`,
          { headers, responseType: 'json' },
        )
      ).body;
      return {
        items: data.map((m) => ({ url: `/g/${m.id}`, title: m.title, thumbnailUrl: m.img })),
        hasNextPage: data.length > 0,
      };
    },
    async search(query: string): Promise<MangaPage> {
      const { document } = await load(`/search?s=${encodeURIComponent(query.trim())}`);
      const items = document.select('div.book-list a').flatMap((a): MangaSummary[] => {
        const title = a.selectFirst('div.book-description p')?.text();
        if (!title) return [];
        return [
          {
            url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
            title,
            thumbnailUrl: a.selectFirst('img.lozad')?.absUrl('data-src') || undefined,
          },
        ];
      });
      return { items, hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(manga.url);
      const tags = (label: string) => selectIgnoreCase(document, `div.tag-container:contains(${label}) span.tags`)[0];
      return {
        url: manga.url,
        title: document.selectFirst('div#info h1')?.text() || manga.title,
        thumbnailUrl: document.selectFirst('div#cover img')?.absUrl('src') || manga.thumbnailUrl,
        artist: tags('Artist:')?.text() || undefined,
        author: tags('Group:')?.text() || undefined,
        genres: (tags('Categories:')?.select('a.tag') ?? []).map((a) => ownText(a)),
        status: 'completed',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { url } = await load(manga.url);
      return [{ url: relativeUrl(url), name: 'Chapter' }];
    },
    // The reader keeps its image list base64-encoded in "la = '...'".
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { body } = await load(chapter.url.replace('/g/', '/read/'));
      const data = /la\s*=\s*'([A-Za-z0-9+/=]+)'/.exec(body)?.[1];
      if (!data) throw new Error('Could not find page data');
      return base64
        .decode(data)
        .split(',')
        .filter(Boolean)
        .map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/(?:g|read)\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/g/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
