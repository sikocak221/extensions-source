import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf } from './common/utils';

const BASE_URL = 'https://manga.clone-army.org';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string) {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return { url: response.url, document: html.load(response.body, { baseUrl: response.url }) };
}

async function catalogue(): Promise<MangaDetails[]> {
  const { document } = await load('/viewer_landing.php');
  const seen = new Set<string>();
  // Arcs of one series can share its link: keep the first.
  const items = document.select('.comicPreviewContainer').map((element): MangaDetails => {
    const style = element.selectFirst('.comicPreview')?.attr('style') ?? '';
    const start = style.indexOf('site/themes');
    return {
      url: `/${(element.selectFirst('a')?.attr('href') ?? '').replace(/^\//, '')}`,
      title: element.selectFirst('h3')?.text() ?? '',
      author: 'Dan Kim',
      artist: 'Dan Kim',
      status: 'unknown',
      description: element.selectFirst('h4')?.text() || undefined,
      thumbnailUrl:
        start >= 0 ? `${BASE_URL}/${style.slice(start, style.indexOf(')', start)).replace(/["']/g, '')}` : undefined,
    };
  });
  return items.filter((m) => !seen.has(m.url) && Boolean(seen.add(m.url)));
}

const toPage = (items: MangaDetails[]): MangaPage => ({
  items: items.map(({ url, title, thumbnailUrl }) => ({ url, title, thumbnailUrl })),
  hasNextPage: false,
});

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async () => toPage(await catalogue()),
    search: async (query) =>
      toPage((await catalogue()).filter((m) => m.title.toLowerCase().includes(query.trim().toLowerCase()))),
    getMangaDetails: async (manga: MangaSummary) =>
      (await catalogue()).find((m) => m.url === manga.url) ?? { ...manga, status: 'unknown' },
    // The viewer's 4th "&page=N&lang=" in its script is the page count; every page is one chapter.
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { url, document } = await load(manga.url);
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      const script = document.select('script')[3]?.html() ?? '';
      const count = Number([...script.matchAll(/&page=(.*?)&lang=/g)][3]?.[1]) || 0;
      return Array.from({ length: count }, (_, i) => count - i).map((n) => ({
        url: `${path}&page=${n}`,
        name: `Chapter ${n}`,
        number: n,
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document } = await load(chapter.url);
      const img = document.selectFirst('.subsectionContainer img');
      const src = img?.absUrl('src') || img?.attr('src');
      return src ? [{ index: 0, imageUrl: src }] : [];
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/viewer\.php\?series=[^&#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
