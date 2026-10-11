import {
  type Chapter,
  type Filter,
  type MangaPage,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, decodeEntities, hostOf, htmlToText, parseDate, withQuery } from './common/utils';

const BASE_URL = 'https://wp.comicskingdom.com';
const HEADERS = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const MANGA_PER_PAGE = 20;
const CHAPTER_PER_PAGE = 100;
const PREF_COMPACT = 'compactPref';
const ORDERS = ['author', 'date', 'id', 'include', 'modified', 'parent', 'relevance', 'title', 'rand'];
const GENRES: [string, string][] = [
  ['Action', 'action'],
  ['Adventure', 'adventure'],
  ['Classic', 'classic'],
  ['Comedy', 'comedy'],
  ['Crime', 'crime'],
  ['Fantasy', 'fantasy'],
  ['Gag Cartoons', 'gag-cartoons'],
  ['Mystery', 'mystery'],
  ['New Arrivals', 'new-arrivals'],
  ['Non-Fiction', 'non-fiction'],
  ['OffBeat', 'offbeat'],
  ['Political Cartoons', 'political-cartoons'],
  ['Romance', 'romance'],
  ['Sci-Fi', 'sci-fi'],
  ['Slice Of Life', 'slice-of-life'],
  ['Superhero', 'superhero'],
  ['Vintage', 'vintage'],
];

interface CkManga {
  id: number;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
  meta: { ck_byline_on_app: string };
  yoast_head: string;
}

interface CkChapter {
  id: number;
  date: string;
  assets?: { single: { url: string } } | null;
  link: string;
}

const preferences: Preference[] = [
  {
    type: 'switch',
    key: PREF_COMPACT,
    label: 'Compact chapters',
    description:
      'Off: each daily/weekly upload becomes a chapter, which can be very slow because some comics have 8000+ uploads',
    default: true,
  },
];

const shouldCompact = (): boolean => prefs.get<boolean>(PREF_COMPACT) ?? true;
const lastSegment = (url: string): string => url.split(/[?#]/)[0]!.split('/').filter(Boolean).pop() ?? '';
const thumbnailOf = (head: string): string | undefined =>
  /thumbnailUrl":"(\S+)","dateP/.exec(head)?.[1]?.replace(/\\\//g, '/');

async function getJson<T>(url: string): Promise<{ body: T; headers: Record<string, string> }> {
  const response = await http.get<T>(url, { headers: HEADERS, responseType: 'json' });
  return { body: response.body, headers: response.headers };
}

export default defineExtension({
  preferences: () => preferences,
  createSource: ({ lang }) => {
    const mangaApi = (params: Record<string, string>): string =>
      withQuery(`${BASE_URL}/wp-json/wp/v2/ck_feature`, {
        per_page: String(MANGA_PER_PAGE),
        _fields: 'id,link,title,content,meta,yoast_head',
        ck_language: lang === 'es' ? 'spanish' : 'english',
        ...params,
      });
    const chapterApi = (path: string, params: Record<string, string>): string =>
      withQuery(`${BASE_URL}/wp-json/wp/v2/ck_comic${path}`, {
        _fields: 'id,date,assets,link',
        ...params,
      });

    async function parseMangaList(url: string): Promise<MangaPage> {
      const { body } = await getJson<CkManga[]>(url);
      const items = body.map((item): MangaSummary => ({
        url: `/wp-json/wp/v2/ck_feature/${item.id}?slug=${lastSegment(item.link)}`,
        title: decodeEntities(item.title.rendered),
        thumbnailUrl: thumbnailOf(item.yoast_head),
      }));
      return { items, hasNextPage: body.length === MANGA_PER_PAGE };
    }

    const list = (orderBy: string, page: number): Promise<MangaPage> =>
      parseMangaList(mangaApi({ orderBy, page: String(page) }));

    async function chapterPage(feature: string, page: number): Promise<CkChapter[]> {
      return (
        await getJson<CkChapter[]>(
          chapterApi('', {
            per_page: String(CHAPTER_PER_PAGE),
            order: 'desc',
            ck_feature: feature,
            page: String(page),
          }),
        )
      ).body;
    }

    return {
      baseUrl: BASE_URL,
      getPopular: (page) => list('relevance', page),
      getLatest: (page) => list('modified', page),
      search: (query, page, filters) => {
        const params: Record<string, string> = { search: query, page: String(page) };
        const order = filters.order;
        if (typeof order === 'string' && order) params.orderby = order;
        const included = GENRES.filter(([, gid]) => filters[`genre.${gid}`] === 'include').map(([, gid]) => gid);
        const excluded = GENRES.filter(([, gid]) => filters[`genre.${gid}`] === 'exclude').map(([, gid]) => gid);
        if (included.length) params.ck_genre = included.join(',');
        if (excluded.length) params.ck_genre_exclude = excluded.join(',');
        return parseMangaList(mangaApi(params));
      },
      getFilters: (): Filter[] => [
        {
          type: 'select',
          id: 'order',
          label: 'Order by',
          options: ORDERS.map((value) => ({ label: value, value })),
          default: ORDERS[0],
        },
        {
          type: 'group',
          id: 'genres',
          label: 'Genres',
          filters: GENRES.map(([label, gid]) => ({ type: 'tristate', id: `genre.${gid}`, label })),
        },
      ],
      getMangaDetails: async (manga) => {
        const data = (await getJson<CkManga>(BASE_URL + manga.url)).body;
        return {
          url: manga.url,
          title: decodeEntities(data.title.rendered),
          author: data.meta.ck_byline_on_app.replace(/^[\s\S]*?By/, '').trim() || undefined,
          description: htmlToText(data.content.rendered),
          thumbnailUrl: thumbnailOf(data.yoast_head),
          status: 'unknown',
        };
      },
      getChapters: async (manga): Promise<Chapter[]> => {
        const data = (await getJson<CkManga>(BASE_URL + manga.url)).body;
        const feature = lastSegment(data.link);

        if (shouldCompact()) {
          const first = await getJson<CkChapter[]>(
            chapterApi('', { per_page: '1', order: 'desc', ck_feature: feature, page: '1' }),
          );
          const header = Object.entries(first.headers).find(([k]) => k.toLowerCase() === 'x-wp-total')?.[1];
          let total = Number(header ?? 0);
          if (!total) {
            // no total header: read the item count from the series page like Tachiyomi does
            const body = (await http.get(data.link, { headers: HEADERS })).body;
            const counts = [...body.matchAll(/"totalItems":(\d+)/g)].map((m) => Number(m[1]));
            total = counts.find((n) => n > 0) ?? 0;
          }
          const pages = Math.ceil(total / CHAPTER_PER_PAGE);
          return Array.from({ length: pages }, (_, idx): Chapter => {
            const start = idx * CHAPTER_PER_PAGE + 1;
            const end = Math.min((idx + 1) * CHAPTER_PER_PAGE, total);
            return {
              url: chapterApi('', {
                per_page: String(CHAPTER_PER_PAGE),
                orderBy: 'date',
                order: 'asc',
                ck_feature: feature,
                page: String(idx + 1),
              }).replace(BASE_URL, ''),
              name: `${start}-${end}`,
              number: idx * 0.01,
            };
          }).reverse();
        }

        const chapters: Chapter[] = [];
        let number = 0;
        for (let page = 1; page < 1000; page++) {
          let data: CkChapter[];
          try {
            data = await chapterPage(feature, page);
          } catch (error) {
            if (chapters.length > 0) break;
            throw error;
          }
          for (const item of data) {
            number += 0.01;
            chapters.push({
              url: `/wp-json/wp/v2/ck_comic/${item.id}?slug=${item.link.replace(BASE_URL, '')}`.replace(
                /\?slug=\/*/,
                '?slug=',
              ),
              name: item.date.split('T')[0] ?? item.date,
              number,
              uploadedAt: parseDate(item.date, "yyyy-MM-dd'T'HH:mm:ss"),
            });
          }
          if (data.length < CHAPTER_PER_PAGE) break;
        }
        return chapters;
      },
      getPages: async (chapter): Promise<Page[]> => {
        const url = BASE_URL + chapter.url;
        if (shouldCompact() && !/\/ck_comic\/\d+/.test(chapter.url)) {
          const body = (await getJson<CkChapter[]>(url)).body;
          return body
            .flatMap((item) => (item.assets ? [item.assets.single.url] : []))
            .map((imageUrl, index) => ({ index, imageUrl }));
        }
        const item = (await getJson<CkChapter>(url)).body;
        return item.assets ? [{ index: 0, imageUrl: item.assets.single.url }] : [];
      },
      imageHeaders: () => HEADERS,
      getWebUrl: (item) => {
        const slug = /[?&]slug=([^&]*)/.exec(item.url)?.[1];
        if (slug) return `${BASE_URL}/${slug.replace(/^\/+/, '')}`;
        const feature = /ck_feature=([^&]*)/.exec(item.url)?.[1];
        return feature && hostOf(BASE_URL) ? `${BASE_URL}/${feature}` : BASE_URL;
      },
    };
  },
});
