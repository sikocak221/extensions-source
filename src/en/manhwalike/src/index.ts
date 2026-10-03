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

const BASE_URL = 'https://manhwalike.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const GENRES = [
  { label: 'Action', value: 'manga-genre-action' },
  { label: 'Adaptation', value: 'manga-genre-adaptation' },
  { label: 'Adult', value: 'manga-genre-adult' },
  { label: 'Adventure', value: 'manga-genre-adventure' },
  { label: 'Boy love', value: 'manga-genre-boy-love' },
  { label: 'Comedy', value: 'manga-genre-comedy' },
  { label: 'Comic', value: 'manga-genre-comic' },
  { label: 'Cooking', value: 'manga-genre-cooking' },
  { label: 'Crime', value: 'manga-genre-crime' },
  { label: 'Doujinshi', value: 'manga-genre-doujinshi' },
  { label: 'Drama', value: 'manga-genre-drama' },
  { label: 'Ecchi', value: 'manga-genre-ecchi' },
  { label: 'Fantasy', value: 'manga-genre-fantasy' },
  { label: 'Full Color', value: 'manga-genre-full-color' },
  { label: 'Game', value: 'manga-genre-game' },
  { label: 'Gender Bender', value: 'manga-genre-gender-bender' },
  { label: 'Harem', value: 'manga-genre-harem' },
  { label: 'Historical', value: 'manga-genre-historical' },
  { label: 'Horror', value: 'manga-genre-horror' },
  { label: 'Isekai', value: 'manga-genre-isekai' },
  { label: 'Josei', value: 'manga-genre-josei' },
  { label: 'Magic', value: 'manga-genre-magic' },
  { label: 'Manga', value: 'manga-genre-manga' },
  { label: 'Manhua', value: 'manga-genre-manhua' },
  { label: 'Manhwa', value: 'manga-genre-manhwa' },
  { label: 'Martial Arts', value: 'manga-genre-martial-arts' },
  { label: 'Mature', value: 'manga-genre-mature' },
  { label: 'Mecha', value: 'manga-genre-mecha' },
  { label: 'Medical', value: 'manga-genre-medical' },
  { label: 'Mystery', value: 'manga-genre-mystery' },
  { label: 'NTR', value: 'manga-genre-ntr' },
  { label: 'Oneshot', value: 'manga-genre-oneshot' },
  { label: 'Psychological', value: 'manga-genre-psychological' },
  { label: 'Reincarnation', value: 'manga-genre-reincarnation' },
  { label: 'Romance', value: 'manga-genre-romance' },
  { label: 'School life', value: 'manga-genre-school-life' },
  { label: 'Sci-fi', value: 'manga-genre-sci-fi' },
  { label: 'Seinen', value: 'manga-genre-seinen' },
  { label: 'Shoujo', value: 'manga-genre-shoujo' },
  { label: 'Shoujo ai', value: 'manga-genre-shoujo-ai' },
  { label: 'Shounen', value: 'manga-genre-shounen' },
  { label: 'Shounen ai', value: 'manga-genre-shounen-ai' },
  { label: 'Slice Of Life', value: 'manga-genre-slice-of-life' },
  { label: 'Smut', value: 'manga-genre-smut' },
  { label: 'Soft Yaoi', value: 'manga-genre-soft-yaoi' },
  { label: 'Soft Yuri', value: 'manga-genre-soft-yuri' },
  { label: 'Sports', value: 'manga-genre-sports' },
  { label: 'Super Power', value: 'manga-genre-super-power' },
  { label: 'Supernatural', value: 'manga-genre-supernatural' },
  { label: 'SURVIVAL', value: 'manga-genre-survival' },
  { label: 'Time travel', value: 'manga-genre-time-travel' },
  { label: 'Tragedy', value: 'manga-genre-tragedy' },
  { label: 'Villainess', value: 'manga-genre-villainess' },
  { label: 'Webtoon', value: 'manga-genre-webtoon' },
  { label: 'Webtoons', value: 'manga-genre-webtoons' },
  { label: 'Yaoi', value: 'manga-genre-yaoi' },
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const original = (img: HtmlElement | null | undefined) =>
  (img?.attr('data-original') ? img.absUrl('data-original') : img?.absUrl('src')) || undefined;

function visuals(elements: HtmlElement[]): MangaSummary[] {
  return elements.flatMap((el): MangaSummary[] => {
    const a = el.selectFirst('a');
    const title = el.selectFirst('h3.title a')?.text();
    if (!a || !title) return [];
    return [
      {
        url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
        title,
        thumbnailUrl: original(el.selectFirst('img')),
      },
    ];
  });
}

function results(document: HtmlElement): MangaPage {
  const rows = document.select('ul.normal li');
  const items = (rows.length ? rows : document.select('ul li')).flatMap((li): MangaSummary[] => {
    const a = li.selectFirst('a');
    const img = li.selectFirst('img');
    if (!a || !img?.attr('alt')) return [];
    return [
      {
        url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
        title: img.attr('alt')!,
        thumbnailUrl: original(img),
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('ul.pagination li:last-child a') != null };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (): Promise<MangaPage> => ({
      items: visuals((await load('/')).select('ul.list-hot div.visual')),
      hasNextPage: false,
    }),
    getLatest: async (): Promise<MangaPage> => ({
      items: visuals((await load('/')).select('ul.slick_item div.visual')),
      hasNextPage: false,
    }),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) {
        const response = await http.post(
          `${BASE_URL}/search/html/1`,
          { form: { keyword: query.trim() } },
          { headers: { ...headers, Accept: 'text/html', 'X-Requested-With': 'XMLHttpRequest' } },
        );
        return results(html.load(response.body, { baseUrl: BASE_URL }));
      }
      const genre = typeof filters.genre === 'string' && filters.genre ? filters.genre : GENRES[0]!.value;
      return results(await load(`/${genre}?page=${page}`));
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'NOTE: Ignored if using text search!' },
      { type: 'separator' },
      { type: 'select', id: 'genre', label: 'Genre', options: GENRES },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const status = document.selectFirst('small:contains(Status) + strong')?.text().toLowerCase() ?? '';
      return {
        url: manga.url,
        title: document.selectFirst('h1')?.text() || manga.title,
        author: document.selectFirst('div.author a')?.text(),
        status: status.includes('ongoing') ? 'ongoing' : status.includes('finish') ? 'completed' : 'unknown',
        genres: document.select('div.categories a').map((a) => a.text()),
        description: document.selectFirst('div.summary-block p.about')?.text(),
        thumbnailUrl: document.selectFirst('div.fixed-img img')?.absUrl('src') || manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      return (await load(manga.url)).select('ul.chapter-list li').flatMap((li): Chapter[] => {
        const a = li.selectFirst('a');
        if (!a) return [];
        // Dates are New York time.
        const time = parseDate(li.selectFirst('.time')?.text(), 'MMMM d, yyyy');
        return [
          {
            url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
            name: a.text(),
            uploadedAt: time === undefined ? undefined : time + 5 * 3_600_000,
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      return (await load(chapter.url))
        .select('.chapter-content .page-chapter img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.attr('src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
