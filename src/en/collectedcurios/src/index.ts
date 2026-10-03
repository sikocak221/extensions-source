import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf } from './common/utils';

const BASE_URL = 'https://www.collectedcurios.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const AUTHOR = 'Jolly Jack aka Phillip M Jackson';

const SERIES: MangaDetails[] = [
  ['Sequential Art', '/sequentialart.php', 'Sequential_Art'],
  ['Battle Bunnies', '/battlebunnies.php', 'Battle_Bunnies'],
  ['Spider and Scorpion', '/spiderandscorpion.php', 'Spider_And_Scorpion'],
].map(([title, url, button]) => ({
  url: url!,
  title: title!,
  author: AUTHOR,
  artist: AUTHOR,
  status: 'ongoing',
  description: `${title} webcomic.`,
  thumbnailUrl: `${BASE_URL}/images/CC_2011_${button}_Button.jpg`,
}));

async function load(url: string) {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const catalogue = (items: MangaDetails[]): MangaPage => ({
  items: items.map(({ url, title, thumbnailUrl }) => ({ url, title, thumbnailUrl })),
  hasNextPage: false,
});

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async () => catalogue(SERIES),
    search: async (query) =>
      catalogue(SERIES.filter((s) => s.title.toLowerCase().includes(query.trim().toLowerCase()))),
    getMangaDetails: async (manga: MangaSummary) =>
      SERIES.find((s) => s.url === manga.url) ?? { ...manga, status: 'unknown' },
    // Strips are numbered: the newest number comes from the "Last"/"Back one" buttons or the jump box.
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      const number = (href: string | undefined) => Number(href?.split('=')[1]) || undefined;
      const last =
        number(document.selectFirst('a:has(> img[title=Last])')?.attr('href')) ??
        (Number(document.selectFirst('input[title="Jump to number"]')?.attr('value')) || undefined) ??
        ((number(document.selectFirst('a:has(> img[title="Back one"])')?.attr('href')) ?? 0) + 1 || 1);
      return Array.from({ length: last }, (_, i) => last - i).map((n) => ({
        url: `${manga.url}?s=${n}`,
        name: `Chapter - ${n}`,
        number: n,
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      const img = document.selectFirst(chapter.url.includes('sequentialart') ? '.w3-image' : '#strip');
      const src = img?.absUrl('src') || img?.attr('src');
      if (!src) throw new Error('Could not find the image');
      return [{ index: 0, imageUrl: src }];
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[a-z]+\.php)/i.exec(url.trim());
      if (!match || match[1]!.toLowerCase() !== hostOf(BASE_URL)) return null;
      const series = SERIES.find((s) => s.url === match[2]);
      return series ? { url: series.url, title: series.title } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
