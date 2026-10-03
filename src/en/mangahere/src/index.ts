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
import { findPacked, unpack } from './packer';

const BASE_URL = 'https://www.mangahere.cc';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, Cookie: 'isAdult=1' };

const GENRES: [string, number][] = [
  ['Action', 1],
  ['Adventure', 2],
  ['Comedy', 3],
  ['Fantasy', 4],
  ['Historical', 5],
  ['Horror', 6],
  ['Martial Arts', 7],
  ['Mystery', 8],
  ['Romance', 9],
  ['Shounen Ai', 10],
  ['Supernatural', 11],
  ['Drama', 12],
  ['Shounen', 13],
  ['School Life', 14],
  ['Shoujo', 15],
  ['Gender Bender', 16],
  ['Josei', 17],
  ['Psychological', 18],
  ['Seinen', 19],
  ['Slice of Life', 20],
  ['Sci-fi', 21],
  ['Ecchi', 22],
  ['Harem', 23],
  ['Shoujo Ai', 24],
  ['Yuri', 25],
  ['Mature', 26],
  ['Tragedy', 27],
  ['Yaoi', 28],
  ['Doujinshi', 29],
  ['Sports', 30],
  ['Adult', 31],
  ['One Shot', 32],
  ['Smut', 33],
  ['Mecha', 34],
  ['Shotacon', 35],
  ['Lolicon', 36],
  ['Webtoons', 37],
];

const TYPES: [string, number][] = [
  ['American Manga', 5],
  ['Any', 0],
  ['Chinese Manhua', 3],
  ['European Manga', 4],
  ['Hong Kong Manga', 6],
  ['Japanese Manga', 1],
  ['Korean Manhwa', 2],
  ['Other Manga', 7],
];

async function fetchText(url: string, extra: Record<string, string> = {}) {
  return http.get(absoluteUrl(BASE_URL, url), { headers: { ...headers, ...extra } });
}

async function load(url: string): Promise<HtmlElement> {
  const response = await fetchText(url);
  return html.load(response.body, { baseUrl: response.url });
}

function summaries(document: HtmlElement, selector: string, link: string, cover: string): MangaPage {
  const items = document.select(selector).flatMap((li): MangaSummary[] => {
    const a = li.selectFirst(link);
    if (!a) return [];
    return [
      {
        url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
        title: a.attr('title') || a.text(),
        thumbnailUrl: li.selectFirst(cover)?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('div.pager-list-left a:last-child') != null };
}

const directory = async (url: string) =>
  summaries(await load(url), '.manga-list-1-list li', 'a', 'img.manga-list-1-cover');

function chapterDate(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (text.includes('Today') || text.includes(' ago')) return today.getTime();
  if (text.includes('Yesterday')) return today.getTime() - 86_400_000;
  return parseDate(text, 'MMM dd,yyyy');
}

/** Joins the quoted pieces of `var guidkey=''+'2'+'7'+...;`. */
const concatLiterals = (expression: string) => [...expression.matchAll(/'([^']*)'/g)].map((m) => m[1]).join('');

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => directory(`/directory/${page}.htm`),
    getLatest: (page) => directory(`/directory/${page}.htm?latest`),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const text = (id: string) => encodeURIComponent(typeof filters[id] === 'string' ? (filters[id] as string) : '');
      const select = (id: string, fallback: string) =>
        typeof filters[id] === 'string' ? (filters[id] as string) : fallback;
      const include = GENRES.filter(([, id]) => filters[`genre.${id}`] === 'include').map(([, id]) => id);
      const exclude = GENRES.filter(([, id]) => filters[`genre.${id}`] === 'exclude').map(([, id]) => id);
      const params = [
        `type=${select('type', '0')}`,
        `artist_method=cw&artist=${text('artist')}`,
        `author_method=cw&author=${text('author')}`,
        `genres=${include.join(',')}`,
        `nogenres=${exclude.join(',')}`,
        `rating_method=gt&rating=${select('rating', '0')}`,
        `released_method=eq&released=${text('year')}`,
        `st=${select('st', '0')}`,
        `page=${page}`,
        `title=${encodeURIComponent(query.trim())}`,
        'sort=&stype=1&name=',
      ];
      return summaries(
        await load(`/search?${params.join('&')}`),
        '.manga-list-4-list > li',
        '.manga-list-4-item-title > a',
        'img.manga-list-4-cover',
      );
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'type',
        label: 'Type',
        options: TYPES.map(([label, value]) => ({ label, value: String(value) })),
        default: '0',
      },
      { type: 'text', id: 'artist', label: 'Artist' },
      { type: 'text', id: 'author', label: 'Author' },
      {
        type: 'group',
        id: 'genre',
        label: 'Genres',
        filters: GENRES.map(([label, id]) => ({ type: 'tristate', id: `genre.${id}`, label })),
      },
      {
        type: 'select',
        id: 'rating',
        label: 'Minimum rating',
        options: ['No Stars', '1 Star', '2 Stars', '3 Stars', '4 Stars', '5 Stars'].map((label, i) => ({
          label,
          value: String(i),
        })),
        default: '0',
      },
      { type: 'text', id: 'year', label: 'Year released' },
      {
        type: 'select',
        id: 'st',
        label: 'Completed series',
        options: ['Either', 'No', 'Yes'].map((label, i) => ({ label, value: String(i) })),
        default: '0',
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const status = document.selectFirst('span.detail-info-right-title-tip')?.text().toLowerCase() ?? '';
      return {
        url: manga.url,
        title: document.selectFirst('span.detail-info-right-title-font')?.text() || manga.title,
        author: document.selectFirst('.detail-info-right-say > a')?.text() || undefined,
        genres: document.select('.detail-info-right-tag-list > a').map((a) => a.text()),
        description: document.selectFirst('.fullcontent')?.text() || undefined,
        thumbnailUrl: document.selectFirst('img.detail-info-cover-img')?.absUrl('src') || manga.thumbnailUrl,
        status: status.includes('ongoing') ? 'ongoing' : status.includes('completed') ? 'completed' : 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      return (await load(manga.url)).select('ul.detail-main-list > li').flatMap((li): Chapter[] => {
        const a = li.selectFirst('a');
        if (!a) return [];
        return [
          {
            url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
            name: li.selectFirst('a p.title3')?.text() || a.text(),
            uploadedAt: chapterDate(li.selectFirst('a p.title2')?.text()),
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await fetchText(chapter.url);
      const body = response.body;
      const packed = findPacked(body);
      if (!packed) throw new Error('Could not find the page script');
      const script = unpack(packed);
      // Webtoon chapters list every image up front.
      if (body.includes('chapter_bar')) {
        const urls = script.split("newImgs=['")[1]?.split("'];")[0] ?? '';
        return urls.split("','").map((src, index) => ({ index, imageUrl: `https:${src}` }));
      }
      const key = concatLiterals(script.slice(script.indexOf("'"), script.indexOf(';')));
      const chapterId = /chapterid\s*=\s*(\d+)/.exec(body)?.[1];
      const count = Number(/imagecount\s*=\s*(\d+)/.exec(body)?.[1] ?? 0);
      if (!chapterId || !count) throw new Error('Could not find chapter info');
      const link = response.url;
      const base = link.slice(0, link.lastIndexOf('/'));
      return Array.from({ length: count }, (_, i) => ({
        index: i,
        url: `${base}/chapterfun.ashx?cid=${chapterId}&page=${i + 1}&key=${key}#${link}`,
      }));
    },
    async getImageUrl(page: Page): Promise<string> {
      const [url, referer] = (page.url ?? '').split('#');
      const extra = { Referer: referer ?? BASE_URL, Accept: '*/*', 'X-Requested-With': 'XMLHttpRequest' };
      for (const attempt of [0, 1, 2]) {
        const { body } = await fetchText(attempt === 0 ? url! : url!.replace(/key=[^&]*/, 'key='), extra);
        if (!body) continue;
        const script = unpack(body);
        const pix = /pix="([^"]*)"/.exec(script)?.[1];
        const first = /pvalue=\["([^"]*)"/.exec(script)?.[1];
        if (pix == null || first == null) throw new Error('Could not parse image script');
        return `https:${pix}${first}`;
      }
      throw new Error('Empty image response');
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/manga\/[^/?#]+\/)/i.exec(url.trim());
      return match && match[1]!.toLowerCase().replace(/^m\./, 'www.') === hostOf(BASE_URL)
        ? { url: match[2]!, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
