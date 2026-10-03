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
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://doujins.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const PAGE_DAYS = 3;
const SERIES = [
  { label: 'None', value: '' },
  { label: 'Doujins - Original Series', value: '/doujins-original-series-19934' },
  { label: 'Hentai Magazine Chapters', value: '/hentai-magazine-chapters-2766' },
  { label: 'Hentai Manga', value: '/hentai-manga-19' },
  { label: 'Fate Grand Order', value: '/fate-grand-order-doujins-28615' },
  { label: 'CG Sets - Original Series', value: '/cg-sets-original-series-14865' },
  { label: 'Touhou', value: '/touhou-doujins-7748' },
  { label: 'Naruto', value: '/naruto-doujins-5761' },
  { label: 'Kantai Collection', value: '/kantai-collection-doujins-22720' },
  { label: 'Hentai Game CG-Sets', value: '/hentai-game-cg-sets-2422' },
  { label: 'One Piece', value: '/one-piece-doujins-6080' },
  { label: 'Granblue Fantasy', value: '/granblue-fantasy-doujins-28177' },
  { label: 'Azur Lane', value: '/azur-lane-doujins-34298' },
  { label: 'Sword Art Online', value: '/sword-art-online-doujins-7246' },
  { label: 'Idolmaster', value: '/idolmaster-4281' },
  { label: 'My Hero Academia', value: '/my-hero-academia-doujins-28744' },
  { label: 'Love Live', value: '/love-live-doujins-21865' },
  { label: 'Pokemon', value: '/pokemon-doujins-6393' },
  { label: 'Dragon Ball', value: '/dragon-ball-doujins-1238' },
  { label: 'CGs - Mixed Series', value: '/cgs-mixed-series-35311' },
  { label: 'Doujins - Mixed Series', value: '/doujins-mixed-series-20091' },
  { label: 'Hentai Magazine Chapters', value: '/hentai-magazine-chapters-2766' },
  { label: 'Hentai Magazine Chapters - Super-Shorts', value: '/hentai-magazine-chapters-super-shorts-19933' },
  { label: 'Hentai Manga', value: '/hentai-manga-19' },
];
const SORTS = [
  { label: 'Newest First', value: '' },
  { label: 'Oldest First', value: 'created_at' },
  { label: 'Alphabetical', value: 'name' },
  { label: 'Rating', value: '-cached_score' },
  { label: 'Popularity', value: '-cached_views' },
];
const PERIODS = [
  { label: 'This Month', value: '/top' },
  { label: 'This Year', value: '/top/year' },
  { label: 'All Time', value: '/top/all' },
];

async function load(url: string) {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return { url: response.url, document: html.load(response.body, { baseUrl: response.url }) };
}

function gallery(document: HtmlElement): MangaPage {
  const items = document
    .select('div:not(.premium-folder) > .thumbnail-doujin a.gallery-visited-from-favorites')
    .map((a) => ({
      url: relativeUrl(a.attr('href') ?? ''),
      title: a
        .select('div.title .text')
        .map((e) => e.text())
        .join(' '),
      thumbnailUrl:
        a
          .selectFirst('img')
          ?.attr('srcset')
          ?.split(/[\s,]+/)[0] || undefined,
    }));
  const pagination = document.selectFirst('.pagination');
  return {
    items,
    hasNextPage:
      pagination != null &&
      !(pagination.selectFirst('li.page-item:last-child')?.attr('class') ?? '').includes('disabled'),
  };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async () => gallery((await load('/top/month')).document),
    // Latest: folders published in a window of three days per page.
    async getLatest(page: number): Promise<MangaPage> {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const end = today.getTime() / 1000 + 86_400 - (page - 1) * PAGE_DAYS * 86_400;
      const start = end - PAGE_DAYS * 86_400;
      const data = (
        await http.get<{ folders: { link: string; name: string; thumbnail2: string }[] }>(
          `${BASE_URL}/folders?start=${start}&end=${end}`,
          { headers, responseType: 'json' },
        )
      ).body;
      return {
        items: data.folders.map((f) => ({ url: relativeUrl(f.link), title: f.name, thumbnailUrl: f.thumbnail2 })),
        hasNextPage: true,
      };
    },
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const text = (id: string, fallback: string) =>
        typeof filters[id] === 'string' && filters[id] ? (filters[id] as string) : fallback;
      const sort = text('sort', SORTS[0]!.value);
      const series = text('series', '');
      const url = query.trim()
        ? withQuery(`${BASE_URL}/searches`, { words: query.trim(), page: String(page), sort })
        : series
          ? withQuery(`${BASE_URL}${series}`, { sort })
          : `${BASE_URL}${text('period', PERIODS[0]!.value)}`;
      return gallery((await load(url)).document);
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'Text search ignores series and period filters' },
      { type: 'separator' },
      { type: 'header', label: 'Series filter overrides period filter' },
      { type: 'select', id: 'series', label: 'Series', options: SERIES },
      { type: 'separator' },
      { type: 'header', label: 'Period filter only applies at initial page' },
      { type: 'select', id: 'period', label: 'Popularity period', options: PERIODS },
      { type: 'separator' },
      { type: 'header', label: 'Sort only works with text search and series filter' },
      { type: 'select', id: 'sort', label: 'Sort', options: SORTS },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(manga.url);
      const titles = document.select('.folder-title a');
      const artists =
        document
          .select('.gallery-artist a')
          .map((a) => a.text())
          .join(', ') || undefined;
      return {
        url: manga.url,
        title: titles[titles.length - 1]?.text() || manga.title,
        artist: artists,
        author: artists,
        genres: document
          .selectFirst('.tag-area')
          ?.select('a')
          .map((a) => a.text()),
        thumbnailUrl: manga.thumbnailUrl,
        status: 'completed',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { url, document } = await load(manga.url);
      const date = (document.selectFirst('.text-md-right.text-sm-left > .folder-message')?.text() ?? '')
        .split(' • ')[0]!
        .replace(/(\d)(st|nd|rd|th),/, '$1,');
      const translated = document
        .select('div.folder-message')
        .find((e) => e.text().includes('Translated'))
        ?.text();
      return [
        {
          url: relativeUrl(url),
          name: 'Chapter',
          scanlator: translated?.split('by:')[1]?.trim() || undefined,
          uploadedAt: parseDate(date, 'MMMM d, yyyy'),
        },
      ];
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document } = await load(chapter.url);
      return document
        .select('.doujin')
        .map((page, index) => ({ index, imageUrl: (page.attr('data-file') ?? '').replace(/amp;/g, '') }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
