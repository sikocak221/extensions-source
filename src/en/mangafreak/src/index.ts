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

const BASE_URL = 'https://ww3.mangafreak.me';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const GENRES: string[] = [
  'Act',
  'Adult',
  'Adventure',
  'Ancients',
  'Animated',
  'Comedy',
  'Demons',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Gender Bender',
  'Harem',
  'Horror',
  'Josei',
  'Magic',
  'Martial Arts',
  'Mature',
  'Mecha',
  'Military',
  'Mystery',
  'One Shot',
  'Psychological',
  'Romance',
  'School Life',
  'Sci Fi',
  'Seinen',
  'Shoujo',
  'Shoujoai',
  'Shounen',
  'Shounenai',
  'Slice Of Life',
  'Smut',
  'Sports',
  'Super Power',
  'Supernatural',
  'Tragedy',
  'Vampire',
  'Yaoi',
  'Yuri',
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function item(element: HtmlElement, linkSelector: string): MangaSummary | null {
  const a = element.selectFirst(linkSelector);
  if (!a) return null;
  return {
    url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
    title: a.text(),
    thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined,
  };
}

const items = (elements: HtmlElement[], selector: string) =>
  elements.map((e) => item(e, selector)).filter((m): m is MangaSummary => m != null && Boolean(m.title));

// "12b" → 12.2 ("b" is the second extra part), "12.5" stays.
function chapterNumber(name: string): number | undefined {
  const match = /(\d+)(\.\d+|[a-i]+\b)?/.exec(name);
  if (!match) return undefined;
  if (!match[2] || match[2].startsWith('.')) return Number(match[0]);
  return Number(match[1]) + Number(`0.${[...match[2]].map((c) => c.charCodeAt(0) - 96).join('')}`);
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(page: number): Promise<MangaPage> {
      const document = await load(`/Genre/All/${page}`);
      return {
        items: items(document.select('div.ranking_item'), 'a'),
        hasNextPage: document.select('a.next_p').length > 0,
      };
    },
    async getLatest(page: number): Promise<MangaPage> {
      const document = await load(page === 1 ? '/' : `/Latest_Releases/${page}`);
      const list = document.select('div.latest_item, div.latest_releases_item').flatMap((el): MangaSummary[] => {
        const found = item(el, (el.attr('class') ?? '').includes('latest_item') ? 'a.name' : 'a');
        if (!found) return [];
        // Thumbnails are minis ("/mini_images/<slug>/..."): use the full cover.
        const mini = /\/mini_images\/([^/]+)/.exec(found.thumbnailUrl ?? '')?.[1];
        return [
          {
            ...found,
            thumbnailUrl: mini
              ? found.thumbnailUrl!.replace(/^(https?:\/\/[^/]+).*$/, `$1/manga_images/${mini}.jpg`)
              : found.thumbnailUrl,
          },
        ];
      });
      return { items: list, hasNextPage: document.select('a.next_p').length > 0 };
    },
    async search(query: string, _page: number, filters: FilterState): Promise<MangaPage> {
      const parts: string[] = [];
      if (query.trim()) parts.push(`Find/${encodeURIComponent(query.trim())}`);
      const genre = GENRES.map((g) =>
        filters[`genre.${g}`] === 'include' ? '1' : filters[`genre.${g}`] === 'exclude' ? '2' : '0',
      ).join('');
      parts.push(`Genre/${genre}`);
      parts.push(`Type/${typeof filters.type === 'string' && filters.type ? filters.type : '0'}`);
      parts.push(`Status/${typeof filters.status === 'string' && filters.status ? filters.status : '0'}`);
      const document = await load(`/${parts.join('/')}`);
      return {
        items: items(document.select('div.manga_search_item, div.mangaka_search_item'), 'h3 a, h5 a'),
        hasNextPage: false,
      };
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'Filters do not work if search bar is empty' },
      {
        type: 'group',
        id: 'genre',
        label: 'Genres',
        filters: GENRES.map((g) => ({ type: 'tristate', id: `genre.${g}`, label: g })),
      },
      {
        type: 'select',
        id: 'type',
        label: 'Type',
        options: [
          { label: 'Both', value: '0' },
          { label: 'Manga', value: '2' },
          { label: 'Manhwa', value: '1' },
        ],
      },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [
          { label: 'Both', value: '0' },
          { label: 'Completed', value: '1' },
          { label: 'Ongoing', value: '2' },
        ],
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const data = document.select('div.manga_series_data > div');
      const status = data[1]?.text().toLowerCase() ?? '';
      return {
        url: manga.url,
        title:
          document
            .select('div.manga_series_data h5')
            .map((h) => h.text())
            .join(' ') || manga.title,
        thumbnailUrl: document.selectFirst('div.manga_series_image img')?.absUrl('src') || manga.thumbnailUrl,
        status:
          status === 'on-going' || status === 'ongoing' ? 'ongoing' : status === 'completed' ? 'completed' : 'unknown',
        author: data[2]?.text() || undefined,
        artist: data[3]?.text() || undefined,
        genres: document.select('div.series_sub_genre_list a').map((a) => a.text()),
        description:
          document
            .select('div.manga_series_description p')
            .map((p) => p.text())
            .join(' ') || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const rows = (await load(manga.url)).select('div.manga_series_list tr:has(a)');
      await timers.sleep(0);
      const chapters: Chapter[] = [];
      for (let i = 0; i < rows.length; i++) {
        const cells = rows[i]!.select('td');
        const name = cells[0]?.text() ?? '';
        const a = rows[i]!.selectFirst('a');
        chapters.push({
          url: relativeUrl(a?.absUrl('href') || a?.attr('href') || ''),
          name,
          number: chapterNumber(name),
          uploadedAt: parseDate(cells[1]?.text(), 'yyyy/M/d'),
        });
        if (i % 300 === 299) await timers.sleep(0);
      }
      return chapters.reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      return (await load(chapter.url))
        .select('img#gohere[src]')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.attr('src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/Manga\/[^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
