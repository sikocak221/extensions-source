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
import { USER_AGENT, absoluteUrl, hostOf, ownText, parseDate } from './common/utils';

const BASE_URL = 'https://demonicscans.org';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const STATUSES = [
  { label: 'All', value: 'all' },
  { label: 'Ongoing', value: 'ongoing' },
  { label: 'Completed', value: 'completed' },
];
const SORTS = [
  { label: 'Top Views', value: 'VIEWS DESC' },
  { label: 'A To Z', value: 'NAME ASC' },
];
const GENRES = [
  { label: 'Action', value: '1' },
  { label: 'Adventure', value: '2' },
  { label: 'Comedy', value: '3' },
  { label: 'Cooking', value: '34' },
  { label: 'Doujinshi', value: '25' },
  { label: 'Drama', value: '4' },
  { label: 'Ecchi', value: '19' },
  { label: 'Fantasy', value: '5' },
  { label: 'Gender Bender', value: '30' },
  { label: 'Harem', value: '10' },
  { label: 'Historical', value: '28' },
  { label: 'Horror', value: '8' },
  { label: 'Isekai', value: '33' },
  { label: 'Josei', value: '31' },
  { label: 'Martial Arts', value: '6' },
  { label: 'Mature', value: '22' },
  { label: 'Mecha', value: '32' },
  { label: 'Mystery', value: '15' },
  { label: 'One Shot', value: '26' },
  { label: 'Psychological', value: '11' },
  { label: 'Romance', value: '12' },
  { label: 'School Life', value: '13' },
  { label: 'Sci-fi', value: '16' },
  { label: 'Seinen', value: '17' },
  { label: 'Shoujo', value: '14' },
  { label: 'Shoujo Ai', value: '23' },
  { label: 'Shounen', value: '7' },
  { label: 'Shounen Ai', value: '29' },
  { label: 'Slice of Life', value: '21' },
  { label: 'Smut', value: '27' },
  { label: 'Sports', value: '20' },
  { label: 'Supernatural', value: '9' },
  { label: 'Tragedy', value: '18' },
  { label: 'Webtoons', value: '24' },
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

// Links keep the site's raw paths (spaces and all): encode them.
const path = (href: string | undefined) => {
  const value = (href ?? '').replace(/^https?:\/\/[^/]+/, '');
  let decoded = value;
  try {
    decoded = decodeURI(value);
  } catch {
    // Keep it as is.
  }
  return encodeURI(decoded.startsWith('/') ? decoded : `/${decoded}`);
};
const nextPage = (document: HtmlElement) =>
  document.select('div.pagination > ul > a > li').some((li) => li.text().includes('Next'));

async function advanced(params: string): Promise<MangaPage> {
  const document = await load(`/advanced.php?${params}`);
  const items = document.select('div#advanced-content > div.advanced-element').map((el) => ({
    url: path(el.selectFirst('a')?.attr('href')),
    title: ownText(el.selectFirst('h1')),
    thumbnailUrl: el.selectFirst('img')?.absUrl('src') || undefined,
  }));
  return { items, hasNextPage: nextPage(document) };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => advanced(`list=${page}&status=all&orderby=VIEWS%20DESC`),
    async getLatest(page: number): Promise<MangaPage> {
      const document = await load(`/lastupdates.php?list=${page}`);
      const items = document
        .select('div#updates-container > div.updates-element:not(:has(.toffee-badge))')
        .map((el) => {
          const a = el.selectFirst('div.updates-element-info a');
          return {
            url: path(a?.attr('href')),
            title: ownText(a),
            thumbnailUrl: el.selectFirst('div.thumb img')?.absUrl('src') || undefined,
          };
        });
      return { items, hasNextPage: nextPage(document) };
    },
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (!query.trim()) {
        const params = [`list=${page}`];
        for (const [id, value] of Object.entries(filters))
          if (id.startsWith('genre.') && value === true) params.push(`genre[]=${id.slice(6)}`);
        params.push(
          `status=${encodeURIComponent(typeof filters.status === 'string' && filters.status ? filters.status : 'all')}`,
        );
        params.push(
          `orderby=${encodeURIComponent(typeof filters.sort === 'string' && filters.sort ? filters.sort : 'VIEWS DESC')}`,
        );
        return advanced(params.join('&'));
      }
      const document = await load(`/search.php?manga=${encodeURIComponent(query.trim())}`);
      const items = document.select('body > a[href]').map((a) => ({
        url: path(a.attr('href')),
        title: ownText(a.selectFirst('div.seach-right > div')),
        thumbnailUrl: a.selectFirst('img')?.absUrl('src') || undefined,
      }));
      return { items, hasNextPage: false };
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'Ignored when using text search' },
      { type: 'separator' },
      { type: 'select', id: 'sort', label: 'Sort', options: SORTS },
      { type: 'select', id: 'status', label: 'Status', options: STATUSES },
      {
        type: 'group',
        id: 'genre',
        label: 'Genres',
        filters: GENRES.map((g) => ({ type: 'checkbox', id: `genre.${g.value}`, label: g.label })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const info = (await load(manga.url)).selectFirst('div#manga-info-container');
      const stat = (label: string) =>
        info
          ?.select('div#manga-info-stats > div')
          .find((d) => d.selectFirst('li')?.text().includes(label))
          ?.select('li')[1]
          ?.text() ?? '';
      const author = stat('Author');
      const status = stat('Status').toLowerCase();
      return {
        url: manga.url,
        title: ownText(info?.selectFirst('h1.big-fat-titles')) || manga.title,
        thumbnailUrl: info?.selectFirst('div#manga-page img')?.absUrl('src') || manga.thumbnailUrl,
        genres: info?.select('div.genres-list > li').map((li) => li.text()),
        description: info?.selectFirst('div#manga-info-rightColumn > div > div.white-font')?.text(),
        author: author && !/updating/i.test(author) ? author : undefined,
        status: status.includes('ongoing') ? 'ongoing' : status.includes('completed') ? 'completed' : 'unknown',
      };
    },
    // Long lists (thousands of chapters) yield every 300 items: the sandbox stops code running > 2 s straight.
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const links = (await load(manga.url)).select('div#chapters-list a.chplinks');
      await timers.sleep(0);
      const chapters: Chapter[] = [];
      for (let i = 0; i < links.length; i++) {
        const a = links[i]!;
        chapters.push({
          url: path(a.attr('href')),
          name: ownText(a),
          uploadedAt: parseDate(ownText(a.selectFirst('span')), 'yyyy-MM-dd'),
        });
        if (i % 300 === 299) await timers.sleep(0);
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      return (await load(chapter.url))
        .select('div > img.imgholder')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.attr('src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/manga\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: path(match[2]), title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
