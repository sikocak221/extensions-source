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

const BASE_URL = 'https://fanfox.net';
const MOBILE_URL = 'https://m.fanfox.net';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, Cookie: 'isAdult=1' };

const GENRES: [string, number][] = [
  ['Action', 1],
  ['Adventure', 2],
  ['Comedy', 3],
  ['Drama', 4],
  ['Fantasy', 5],
  ['Martial Arts', 6],
  ['Shounen', 7],
  ['Horror', 8],
  ['Supernatural', 9],
  ['Harem', 10],
  ['Psychological', 11],
  ['Romance', 12],
  ['School Life', 13],
  ['Shoujo', 14],
  ['Mystery', 15],
  ['Sci-fi', 16],
  ['Seinen', 17],
  ['Tragedy', 18],
  ['Ecchi', 19],
  ['Sports', 20],
  ['Slice of Life', 21],
  ['Mature', 22],
  ['Shoujo Ai', 23],
  ['Webtoons', 24],
  ['Doujinshi', 25],
  ['One Shot', 26],
  ['Smut', 27],
  ['Yaoi', 28],
  ['Josei', 29],
  ['Historical', 30],
  ['Shounen Ai', 31],
  ['Gender Bender', 32],
  ['Adult', 33],
  ['Yuri', 34],
  ['Mecha', 35],
  ['Lolicon', 36],
  ['Shotacon', 37],
];

type Options = [string, string][];

const TEXT_METHODS: Options = [
  ['contain', 'cw'],
  ['begin', 'bw'],
  ['end', 'ew'],
];

const SELECTS: { id: string; label: string; options: Options }[] = [
  {
    id: 'type',
    label: 'Type',
    options: [
      ['Any', '0'],
      ['Japanese Manga', '1'],
      ['Korean Manhwa', '2'],
      ['Chinese Manhua', '3'],
      ['European Manga', '4'],
      ['American Manga', '5'],
      ['HongKong Manga', '6'],
      ['Other Manga', '7'],
    ],
  },
  {
    id: 'st',
    label: 'Completed Series',
    options: [
      ['Either', '0'],
      ['Yes', '2'],
      ['No', '1'],
    ],
  },
  { id: 'author_method', label: 'Author method', options: TEXT_METHODS },
  { id: 'artist_method', label: 'Artist method', options: TEXT_METHODS },
  {
    id: 'rating_method',
    label: 'Rating method',
    options: [
      ['is', 'eq'],
      ['less than', 'lt'],
      ['more than', 'gt'],
    ],
  },
  {
    id: 'rating',
    label: 'Rating',
    options: [
      ['any star', ''],
      ['no star', '0'],
      ['1 star', '1'],
      ['2 stars', '2'],
      ['3 stars', '3'],
      ['4 stars', '4'],
      ['5 stars', '5'],
    ],
  },
  {
    id: 'released_method',
    label: 'Release year method',
    options: [
      ['on', 'eq'],
      ['before', 'lt'],
      ['after', 'gt'],
    ],
  },
];

const TEXTS: [string, string][] = [
  ['name', 'Name'],
  ['author', 'Author'],
  ['artist', 'Artist'],
  ['released', 'Release year'],
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function list(document: HtmlElement, selector: string): MangaPage {
  const items = document.select(selector).flatMap((li): MangaSummary[] => {
    const a = li.selectFirst('a');
    if (!a) return [];
    return [
      {
        url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
        title: a.attr('title') || a.text(),
        thumbnailUrl: a.selectFirst('img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('.pager-list-left a.active + a + a') != null };
}

function chapterDate(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (text.includes('Today') || text.includes(' ago')) return today.getTime();
  if (text.includes('Yesterday')) return today.getTime() - 86_400_000;
  return parseDate(text, 'MMM d,yyyy');
}

const directory = async (page: number, latest: boolean) =>
  list(await load(`/directory/${page > 1 ? `${page}.html` : ''}${latest ? '?latest' : ''}`), 'ul.manga-list-1-list li');

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => directory(page, false),
    getLatest: (page) => directory(page, true),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const value = (id: string, fallback = '') =>
        encodeURIComponent(typeof filters[id] === 'string' ? (filters[id] as string) : fallback);
      const params = [`title=${encodeURIComponent(query.trim())}`];
      for (const { id, options } of SELECTS) params.push(`${id}=${value(id, options[0]![1])}`);
      for (const [id] of TEXTS) params.push(`${id}=${value(id)}`);
      const include = GENRES.filter(([, id]) => filters[`genre.${id}`] === 'include').map(([, id]) => id);
      const exclude = GENRES.filter(([, id]) => filters[`genre.${id}`] === 'exclude').map(([, id]) => id);
      params.push(`genres=${include.join(',')}`, `nogenres=${exclude.join(',')}`, 'sort=', 'stype=1');
      if (page > 1) params.push(`page=${page}`);
      return list(await load(`/search?${params.join('&')}`), 'ul.manga-list-4-list li');
    },
    getFilters: (): Filter[] => [
      ...TEXTS.map(([id, label]): Filter => ({ type: 'text', id, label })),
      ...SELECTS.map(({ id, label, options }): Filter => ({
        type: 'select',
        id,
        label,
        options: options.map(([l, v]) => ({ label: l, value: v })),
        default: options[0]![1],
      })),
      {
        type: 'group',
        id: 'genre',
        label: 'Genre',
        filters: GENRES.map(([label, id]) => ({ type: 'tristate', id: `genre.${id}`, label })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const info = document.selectFirst('.detail-info-right');
      const status = info?.selectFirst('.detail-info-right-title-tip')?.text() ?? '';
      return {
        url: manga.url,
        title: info?.selectFirst('.detail-info-right-title-font')?.text() || manga.title,
        author:
          info
            ?.select('.detail-info-right-say a')
            .map((a) => a.text())
            .join(', ') || undefined,
        genres: info?.select('.detail-info-right-tag-list a').map((a) => a.text()) ?? [],
        description: info?.selectFirst('p.fullcontent')?.text() || undefined,
        status: status.includes('Ongoing') ? 'ongoing' : status.includes('Completed') ? 'completed' : 'unknown',
        thumbnailUrl: document.selectFirst('.detail-info-cover-img')?.absUrl('src') || manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      return (await load(manga.url)).select('ul.detail-main-list li a').map((a) => {
        const lines = a.select('.detail-main-list-main p');
        return {
          url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
          name: lines[0]?.text() || a.text(),
          uploadedAt: chapterDate(lines.at(-1)?.text()),
        };
      });
    },
    // The mobile reader lists every page at once when "readway=2" is set.
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.get(MOBILE_URL + chapter.url.replace('/manga/', '/roll_manga/'), {
        headers: { ...headers, Referer: `${MOBILE_URL}/`, Cookie: 'isAdult=1; readway=2' },
      });
      return html
        .load(response.body, { baseUrl: response.url })
        .select('#viewer img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('data-original') || img.attr('data-original') || '' }));
    },
    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${MOBILE_URL}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/manga\/[^/?#]+\/)/i.exec(url.trim());
      return match && match[1]!.toLowerCase().replace(/^(m|www)\./, '') === hostOf(BASE_URL)
        ? { url: match[2]!, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
