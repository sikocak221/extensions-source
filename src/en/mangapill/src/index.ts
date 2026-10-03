import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://mangapill.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const GENRES: string[] = [
  'Action',
  'Adventure',
  'Cars',
  'Comedy',
  'Dementia',
  'Demons',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Game',
  'Harem',
  'Hentai',
  'Historical',
  'Horror',
  'Josei',
  'Kids',
  'Magic',
  'Martial Arts',
  'Mecha',
  'Military',
  'Music',
  'Mystery',
  'Parody',
  'Police',
  'Psychological',
  'Romance',
  'Samurai',
  'School',
  'Sci-Fi',
  'Seinen',
  'Shoujo',
  'Shoujo Ai',
  'Shounen',
  'Shounen Ai',
  'Slice of Life',
  'Space',
  'Sports',
  'Super Power',
  'Supernatural',
  'Thriller',
  'Vampire',
  'Yaoi',
  'Yuri',
];
const option = (label: string, value: string) => ({ label, value });

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function card(element: HtmlElement): MangaSummary | null {
  const link = element.selectFirst("a[href^='/manga/']");
  if (!link) return null;
  return {
    url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
    title: element.selectFirst('div.line-clamp-2')?.text() ?? '',
    thumbnailUrl: element.selectFirst('img')?.attr('data-src'),
  };
}

const cards = (elements: HtmlElement[]) =>
  elements.map(card).filter((m): m is MangaSummary => m != null && Boolean(m.title));

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (): Promise<MangaPage> => ({
      items: cards((await load('/')).select('div:has(h4:contains(Trending)) > .grid > div:not([class])')),
      hasNextPage: false,
    }),
    getLatest: async (): Promise<MangaPage> => ({
      items: cards((await load('/chapters')).select('.grid > div:not([class])')),
      hasNextPage: false,
    }),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params = [`page=${page}`, `q=${encodeURIComponent(query.trim())}`];
      for (const [id, value] of Object.entries(filters)) {
        if (id.startsWith('genre.') && value === 'include') params.push(`genre=${encodeURIComponent(id.slice(6))}`);
      }
      for (const id of ['status', 'type'])
        if (typeof filters[id] === 'string') params.push(`${id}=${encodeURIComponent(filters[id] as string)}`);
      const document = await load(`/search?${params.join('&')}`);
      return {
        items: cards(document.select('.grid > div:not([class])')),
        hasNextPage: document.selectFirst('a.btn.btn-sm') != null,
      };
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'NOTE: Ignored if using text search!' },
      { type: 'separator' },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [
          option('All', ''),
          option('Publishing', 'publishing'),
          option('Finished', 'finished'),
          option('On Hiatus', 'on hiatus'),
          option('Discontinued', 'discontinued'),
          option('Not yet Published', 'not yet published'),
        ],
      },
      {
        type: 'select',
        id: 'type',
        label: 'Type',
        options: [
          option('All', ''),
          ...['Manga', 'Novel', 'One-Shot', 'Doujinshi', 'Manhwa', 'Manhua', 'Oel'].map((t) =>
            option(t, t.toLowerCase()),
          ),
        ],
      },
      {
        type: 'group',
        id: 'genre',
        label: 'Genres',
        filters: GENRES.map((g) => ({ type: 'tristate', id: `genre.${g}`, label: g })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const info = 'div.container > div:first-child';
      const status = document
        .select(`${info} > div:last-child > div:nth-child(3) > div:nth-child(2) > div`)
        .map((e) => e.text())
        .join(' ')
        .toLowerCase();
      return {
        url: manga.url,
        title: document.selectFirst('h1')?.text() || manga.title,
        genres: document.select('a[href*=genre]').map((a) => a.text()),
        status: status.includes('publishing') ? 'ongoing' : status.includes('finished') ? 'completed' : 'unknown',
        description:
          document
            .select(`${info} > div:last-child > div:nth-child(2) > p`)
            .map((p) => p.text())
            .join(' ') || undefined,
        thumbnailUrl: document.selectFirst(`${info} > div:first-child > img`)?.attr('data-src') || manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      return (await load(manga.url))
        .select('#chapters > div > a')
        .map((a) => ({ url: relativeUrl(a.absUrl('href') || a.attr('href') || ''), name: a.text() }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      return (await load(chapter.url))
        .select('picture img')
        .map((img, index) => ({ index, imageUrl: img.attr('data-src') ?? '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/manga\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
