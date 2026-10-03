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
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://manhwabuddy.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const GENRES = [
  'Action',
  'Romance',
  'Drama',
  'Martial Arts',
  'Ecchi',
  'Fantasy',
  'Harem',
  'Historical',
  'Mature',
  'Mystery',
  'Psychological',
  'School Life',
  'Smut',
  'Isekai',
  'Thriller',
  'Crime',
  'Sci-Fi',
  'Horror',
  'Mecha',
  'Medical',
  'Sports',
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function latestList(document: HtmlElement, titleOf: (item: HtmlElement) => string): MangaPage {
  const items = document.select('.latest-list .latest-item').flatMap((item): MangaSummary[] => {
    const link = item.selectFirst('a');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: titleOf(item),
        thumbnailUrl: item.selectFirst('img')?.attr('src'),
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('.next') != null };
}

const dateOf = (text?: string) => parseDate(text, 'd MMMM yyyy') ?? parseDate(text, 'd MMM yyyy');

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const items = (await load('/')).select('.item-move').flatMap((item): MangaSummary[] => {
        const link = item.selectFirst('a');
        if (!link) return [];
        return [
          {
            url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
            title: item.selectFirst('h3')?.text() ?? '',
            thumbnailUrl: item.selectFirst('img')?.attr('src'),
          },
        ];
      });
      return { items, hasNextPage: false };
    },
    getLatest: async (page) => latestList(await load(`/page/${page}`), (item) => item.selectFirst('h4')?.text() ?? ''),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const genre = typeof filters.genre === 'string' && filters.genre ? filters.genre : 'action';
      const url = query.trim()
        ? `/search?s=${encodeURIComponent(query.trim())}&page=${page}`
        : `/genre/${genre}/page/${page}`;
      return latestList(await load(url), (item) => item.selectFirst('a')?.attr('title') ?? '');
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'Filter does not work with text search, reset it before filter' },
      { type: 'separator' },
      {
        type: 'select',
        id: 'genre',
        label: 'Genres',
        options: GENRES.map((g) => ({ label: g, value: g.toLowerCase().replace(/ /g, '-') })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const info = document.selectFirst('.main-info-right');
      const status = info?.selectFirst('li:contains(Status) span')?.text();
      return {
        url: manga.url,
        title: manga.title || document.selectFirst('h1')?.text() || '',
        author: info?.selectFirst('li:contains(Author) a')?.text(),
        artist: info?.selectFirst('li:contains(Artist) a')?.text(),
        status: status === 'Ongoing' ? 'ongoing' : status === 'Complete' ? 'completed' : 'unknown',
        genres: info?.select('li:contains(Genres) a').map((a) => a.text()),
        description:
          document
            .select('.short-desc-content p')
            .map((p) => p.text())
            .join('\n') || undefined,
        thumbnailUrl: manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      return (await load(manga.url)).select('.chapter-list a').map((a) => ({
        url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
        name: a.selectFirst('.chapter-name')?.text() ?? a.text(),
        uploadedAt: dateOf(a.selectFirst('.ct-update')?.text()),
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      return (await load(chapter.url))
        .select('.loading')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.attr('src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/manhwa\/[^/?#]+\/?)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
