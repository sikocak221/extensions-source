import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, relativeUrl } from './common/utils';

const BASE_URL = 'https://nb19u.blogspot.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const LABEL = 'مانجا بوروتو';

// The blog holds a single series; its chapters are the posts labelled with LABEL.
const series: MangaDetails = {
  url: `/search/label/${encodeURIComponent(LABEL)}`,
  title: 'BORUTO: Two Blue Vortex',
  artist: 'Mikio Ikemoto',
  author: 'Masashi Kishimoto',
  genres: ['شونين', 'دراما', 'خيال', 'أكشن', 'نينجا'],
  status: 'ongoing',
  thumbnailUrl:
    'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEggWB9vWPMqjEvIoDsJSO29OmW-srULDQD3cS9HJ8cDk0vq2jLwDerUX-i61CqmZf62eBVmWZwU5CgXi0p2lxhKrh2_nZum3p-k3q9QJ2uozove0QAbOKtbd1QPjytjrJc9UsL65X4BbFdgcicLDYubD9LgY1Kco8wyhDGm4YEOim8u1TL42gOFe16NaaEP/s3464/4D55C3C5-9168-4103-B45C-99B52B58B6A5.jpeg',
};

interface Text {
  $t: string;
}

interface Entry {
  title: Text;
  published: Text;
  link: { rel: string; href: string }[];
  author?: { name: Text }[];
}

const listing = async (): Promise<MangaPage> => ({
  items: [{ url: series.url, title: series.title, thumbnailUrl: series.thumbnailUrl }],
  hasNextPage: false,
});

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: listing,
    search: listing,
    getMangaDetails: async (): Promise<MangaDetails> => series,
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const label = decodeURIComponent(manga.url.split('/').pop() ?? LABEL);
      const response = await http.get(
        `${BASE_URL}/feeds/posts/summary/-/${encodeURIComponent(label)}?alt=json&max-results=500`,
        { headers },
      );
      const entries = (JSON.parse(response.body) as { feed: { entry?: Entry[] } }).feed.entry ?? [];
      return entries.flatMap((entry): Chapter[] => {
        const link = entry.link.find((l) => l.rel === 'alternate');
        if (!link) return [];
        return [
          {
            // U+200F keeps the right-to-left title in order next to numbers.
            name: `${entry.title.$t.trim()}‏`,
            url: relativeUrl(link.href),
            uploadedAt: Date.parse(entry.published.$t) || undefined,
            scanlator: entry.author?.[0]?.name.$t,
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.get(`${BASE_URL}${chapter.url}`, { headers });
      const document = html.load(response.body, { baseUrl: response.url });
      return document
        .select('div#post-body img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.attr('src') || '' }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
