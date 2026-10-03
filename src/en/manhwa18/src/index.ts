import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://manhwa18.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const GENRES: [string, string][] = [
  ['Adult', '4'],
  ['Doujinshi', '9'],
  ['Harem', '17'],
  ['Manga', '24'],
  ['Manhwa', '26'],
  ['Mature', '28'],
  ['NTR', '33'],
  ['Romance', '36'],
  ['Webtoon', '57'],
  ['Action', '59'],
  ['Comedy', '60'],
  ['BL', '61'],
  ['Horror', '62'],
  ['Raw', '63'],
  ['Uncensore', '64'],
  ['Art', '65'],
  ['M18Scan', '66'],
  ['Drama', '68'],
  ['Supernatural', '128'],
  ['Seinen', '160'],
  ['Borderline H', '161'],
  ['Full Color', '162'],
  ['Slice of Life', '163'],
  ['Smut', '164'],
  ['Uncensored', '165'],
  ['Webtoons', '166'],
  ['Explicit Sex', '167'],
  ['Cohabitation', '168'],
  ['Delinquents', '169'],
  ['Fetish', '170'],
  ['Nudity', '171'],
  ['Sexual Abuse', '172'],
  ['Sexual Content', '173'],
  ['Fantasy', '174'],
  ['Ghosts', '175'],
  ['Historical', '176'],
  ['School Life', '177'],
  ['Psychological', '178'],
  ['Incest', '179'],
  ['Japanese Webtoons', '180'],
  ['Coworkers', '181'],
  ['Salaryman', '182'],
  ['Siblings', '183'],
  ['Work Life', '184'],
  ['Gyaru', '185'],
  ['Based on Another Work', '186'],
  ['Demons', '187'],
  ['Crime', '188'],
  ['Mystery', '189'],
  ['Reverse Harem', '190'],
  ['Adventure', '191'],
  ['Isekai', '192'],
  ['Magic', '193'],
  ['Thriller', '194'],
  ['Time Travel', '195'],
  ['Reincarnation', '196'],
  ['Sports', '197'],
  ['Medical', '198'],
  ['Sci Fi', '199'],
  ['AI Art', '200'],
  ['Animal Characteristics', '201'],
  ['Monster Girls', '202'],
  ['Violence', '203'],
  ['Collection of Stories', '204'],
  ['Ecchi', '205'],
  ['Monsters', '206'],
  ['Survival', '207'],
];
const SORTS: [string, string][] = [
  ['Latest update', 'update'],
  ['New manhwa', 'new'],
  ['Most view', 'top'],
  ['Most like', 'like'],
  ['A - Z', 'az'],
  ['Z - A', 'za'],
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const bgUrl = (style?: string) => (style?.includes("url('") ? style.split("url('")[1]!.split("')")[0] : undefined);

async function list(url: string): Promise<MangaPage> {
  const document = await load(url);
  const items = document.select('.thumb-item-flow').flatMap((item): MangaSummary[] => {
    const a = item.selectFirst('a');
    if (!a) return [];
    return [
      {
        url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
        title: item.selectFirst('.series-title a')?.text() ?? '',
        thumbnailUrl:
          item.selectFirst('.lazy-bg')?.attr('data-bg') ?? bgUrl(item.selectFirst('.img-in-ratio')?.attr('style')),
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('.pagination_wrap a.next') != null };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`/tim-kiem?sort=top&page=${page}`),
    getLatest: (page) => list(`/tim-kiem?sort=update&page=${page}`),
    search(query: string, page: number, filters: FilterState) {
      const genres = Object.entries(filters)
        .filter(([id, v]) => id.startsWith('genre.') && v === true)
        .map(([id]) => id.slice(6));
      return list(
        withQuery(`${BASE_URL}/tim-kiem`, {
          q: query.trim() || undefined,
          sort: typeof filters.sort === 'string' && filters.sort ? filters.sort : 'update',
          status: typeof filters.status === 'string' && filters.status !== '0' ? filters.status : undefined,
          accept_genres: genres.join(',') || undefined,
          page: String(page),
        }),
      );
    },
    getFilters: (): Filter[] => [
      { type: 'select', id: 'sort', label: 'Order', options: SORTS.map(([label, value]) => ({ label, value })) },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: ['All', 'Ongoing', 'On hold', 'Completed'].map((label, i) => ({ label, value: String(i) })),
      },
      {
        type: 'group',
        id: 'genre',
        label: 'Genres',
        filters: GENRES.map(([label, id]) => ({ type: 'checkbox', id: `genre.${id}`, label })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const details: MangaDetails = {
        url: manga.url,
        title: document.selectFirst('.series-name a, .au-bento h1, .au-crumb a:last-child')?.text() || manga.title,
        thumbnailUrl: bgUrl(document.selectFirst('.series-cover .img-in-ratio')?.attr('style')) ?? manga.thumbnailUrl,
        description: document.selectFirst('.summary-content')?.text(),
        status: 'unknown',
      };
      const statuses: Record<string, MangaStatus> = { ongoing: 'ongoing', completed: 'completed', onhold: 'hiatus' };
      for (const item of document.select('.series-information .info-item')) {
        const name = item.selectFirst('.info-name')?.text() ?? '';
        const value = item.selectFirst('.info-value')?.text() ?? '';
        if (/author/i.test(name)) details.author = value;
        else if (/genre/i.test(name)) details.genres = item.select('.info-value a').map((a) => a.text());
        else if (/status/i.test(name)) details.status = statuses[value.toLowerCase().replace(/ /g, '')] ?? 'unknown';
      }
      details.author ||= document.selectFirst('.fantrans-value a')?.text();
      return details;
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      return (await load(manga.url)).select('div.au-chgrid a.au-chtile, ul.list-chapters > a').map((a) => {
        const time =
          a.selectFirst('.au-chtile-date')?.text().split('·').pop()?.trim() ??
          a.selectFirst('.chapter-time')?.text().split('-').pop()?.trim();
        return {
          url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
          name: a.attr('data-name') || a.attr('title') || a.text(),
          uploadedAt: parseDate(time, 'd/M/yyyy'),
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      return (await load(chapter.url))
        .select('#chapter-content img.lazy')
        .map((img, index) => ({ index, imageUrl: img.absUrl('data-src') || img.attr('data-src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/manga\/[^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
