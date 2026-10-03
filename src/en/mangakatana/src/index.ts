import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, ownText, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://mangakatana.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const SERVER_PREFERENCE: Preference = {
  type: 'select',
  key: 'server_preference',
  label: 'Server preference',
  options: [
    { label: 'Server 1', value: '' },
    { label: 'Server 2', value: 'mk' },
    { label: 'Server 3', value: '3' },
  ],
  default: '',
};

const GENRES: [string, string][] = [
  ['4-koma', '4 koma'],
  ['action', 'Action'],
  ['adult', 'Adult'],
  ['adventure', 'Adventure'],
  ['artbook', 'Artbook'],
  ['award-winning', 'Award winning'],
  ['comedy', 'Comedy'],
  ['cooking', 'Cooking'],
  ['doujinshi', 'Doujinshi'],
  ['drama', 'Drama'],
  ['ecchi', 'Ecchi'],
  ['erotica', 'Erotica'],
  ['fantasy', 'Fantasy'],
  ['gender-bender', 'Gender Bender'],
  ['gore', 'Gore'],
  ['harem', 'Harem'],
  ['historical', 'Historical'],
  ['horror', 'Horror'],
  ['isekai', 'Isekai'],
  ['josei', 'Josei'],
  ['loli', 'Loli'],
  ['manhua', 'Manhua'],
  ['manhwa', 'Manhwa'],
  ['martial-arts', 'Martial Arts'],
  ['mecha', 'Mecha'],
  ['medical', 'Medical'],
  ['music', 'Music'],
  ['mystery', 'Mystery'],
  ['one-shot', 'One shot'],
  ['overpowered-mc', 'Overpowered MC'],
  ['psychological', 'Psychological'],
  ['reincarnation', 'Reincarnation'],
  ['romance', 'Romance'],
  ['school-life', 'School Life'],
  ['sci-fi', 'Sci-fi'],
  ['seinen', 'Seinen'],
  ['sexual-violence', 'Sexual violence'],
  ['shota', 'Shota'],
  ['shoujo', 'Shoujo'],
  ['shoujo-ai', 'Shoujo Ai'],
  ['shounen', 'Shounen'],
  ['shounen-ai', 'Shounen Ai'],
  ['slice-of-life', 'Slice of Life'],
  ['sports', 'Sports'],
  ['super-power', 'Super power'],
  ['supernatural', 'Supernatural'],
  ['survival', 'Survival'],
  ['time-travel', 'Time Travel'],
  ['tragedy', 'Tragedy'],
  ['webtoon', 'Webtoon'],
  ['yaoi', 'Yaoi'],
  ['yuri', 'Yuri'],
];

async function fetchDocument(url: string): Promise<{ document: HtmlElement; url: string }> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return { document: html.load(response.body, { baseUrl: response.url }), url: response.url };
}

const load = async (url: string) => (await fetchDocument(url)).document;

function list(document: HtmlElement): MangaPage {
  const items = document.select('div#book_list > div.item').flatMap((el): MangaSummary[] => {
    const link = el.selectFirst('div.text > h3 > a');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: ownText(link) || link.text(),
        thumbnailUrl: el.selectFirst('img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('a.next.page-numbers') != null };
}

const thumbnail = (document: HtmlElement) =>
  document.selectFirst('div.media div.cover img')?.absUrl('src') || undefined;

function selected(filters: FilterState, id: string, fallback: string): string {
  return typeof filters[id] === 'string' ? (filters[id] as string) : fallback;
}

export default defineExtension({
  preferences: () => [SERVER_PREFERENCE],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => list(await load(`/manga/page/${page}`)),
    getLatest: async (page) => list(await load(`/page/${page}`)),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      let url: string;
      if (query.trim()) {
        url = `/page/${page}?search=${encodeURIComponent(query.trim())}&search_by=${selected(filters, 'type', 'book_name')}`;
      } else {
        const include: string[] = [];
        const exclude: string[] = [];
        for (const [id] of GENRES) {
          if (filters[`genre.${id}`] === 'include') include.push(id);
          else if (filters[`genre.${id}`] === 'exclude') exclude.push(id);
        }
        const params = ['filter=1'];
        if (include.length) params.push(`include=${include.join('_')}`);
        if (exclude.length) params.push(`exclude=${exclude.join('_')}`);
        params.push(`include_mode=${selected(filters, 'include_mode', 'and')}`);
        params.push(`order=${selected(filters, 'order', 'latest')}`);
        const status = selected(filters, 'status', '');
        if (status) params.push(`status=${status}`);
        const chapters = typeof filters.chapters === 'string' ? filters.chapters.trim() : '';
        params.push(`chapters=${chapters === '-1' ? 'e1' : chapters || '1'}`);
        url = `/manga/page/${page}?${params.join('&')}`;
      }
      const { document, url: finalUrl } = await fetchDocument(url);
      // A search with a single match redirects straight to the manga page.
      if (/\/manga\/[^/?#]+/.test(finalUrl) && document.selectFirst('h1.heading')) {
        return {
          items: [
            {
              url: relativeUrl(finalUrl),
              title: document.selectFirst('h1.heading')!.text(),
              thumbnailUrl: thumbnail(document),
            },
          ],
          hasNextPage: false,
        };
      }
      return list(document);
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'NOTE: Other filters ignored if using text search!' },
      {
        type: 'select',
        id: 'type',
        label: 'Search by',
        options: [
          { label: 'Title', value: 'book_name' },
          { label: 'Author', value: 'author' },
        ],
        default: 'book_name',
      },
      { type: 'separator' },
      {
        type: 'group',
        id: 'genre',
        label: 'Genres',
        filters: GENRES.map(([id, label]) => ({ type: 'tristate', id: `genre.${id}`, label })),
      },
      {
        type: 'select',
        id: 'include_mode',
        label: 'Genre inclusion mode',
        options: [
          { label: 'And', value: 'and' },
          { label: 'Or', value: 'or' },
        ],
        default: 'and',
      },
      {
        type: 'select',
        id: 'order',
        label: 'Sort by',
        options: [
          { label: 'Latest update', value: 'latest' },
          { label: 'New manga', value: 'new' },
          { label: 'A-Z', value: 'az' },
          { label: 'Number of chapters', value: 'numc' },
        ],
        default: 'latest',
      },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [
          { label: 'All', value: '' },
          { label: 'Cancelled', value: '0' },
          { label: 'Ongoing', value: '1' },
          { label: 'Completed', value: '2' },
        ],
        default: '',
      },
      { type: 'text', id: 'chapters', label: 'Minimum chapters (-1 for exactly 1)' },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const alt = document
        .select('.alt_name')
        .map((e) => e.text())
        .join(' ');
      const summary = document
        .select('.summary > p')
        .map((p) => p.text())
        .join(' ');
      const status = document.selectFirst('.value.status')?.text() ?? '';
      return {
        url: manga.url,
        title: document.selectFirst('h1.heading')?.text() || manga.title,
        author:
          document
            .select('.author')
            .map((a) => a.text())
            .join(', ') || undefined,
        description: (summary + (alt ? `\n\nAlt name(s): ${alt}` : '')).trim() || undefined,
        status: status.includes('Ongoing') ? 'ongoing' : status.includes('Completed') ? 'completed' : 'unknown',
        genres: document.select('.genres > a').map((a) => a.text()),
        thumbnailUrl: thumbnail(document) ?? manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      return (await load(manga.url)).select('tr:has(.chapter)').flatMap((tr): Chapter[] => {
        const link = tr.selectFirst('a');
        if (!link) return [];
        return [
          {
            url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
            name: link.text(),
            uploadedAt: parseDate(tr.selectFirst('.update_time')?.text(), 'MMM-dd-yyyy'),
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const server = prefs.get<string>(SERVER_PREFERENCE.key) ?? '';
      const document = await load(server ? `${chapter.url}?sv=${server}` : chapter.url);
      const script =
        document
          .select('script')
          .find((s) => s.html().includes('data-src'))
          ?.html() ?? '';
      const name = /data-src['"],\s*(\w+)/.exec(script)?.[1];
      if (!name) return [];
      const array = new RegExp(`var ${name}=\\[([^\\[]*)]`).exec(script)?.[1] ?? '';
      return [...array.matchAll(/'([^']*)'/g)].map((m, index) => ({ index, imageUrl: m[1]! }));
    },
    imageHeaders: () => headers,
    // Images are served as application/octet-stream; an empty transform lets the host sniff the real type.
    transformImage: () => ({}),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/manga\/[^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
