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
import { USER_AGENT, absoluteUrl, relativeDate, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://read.oppai.stream';
const CDN_URL = 'https://myspacecat.pictures';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const SEARCH_LIMIT = 36;
const ORDERS: [string, string][] = [
  ['', ''],
  ['A-Z', 'az'],
  ['Z-A', 'za'],
  ['Recently Released', 'recent'],
  ['Oldest Releases', 'old'],
  ['Most Views', 'views'],
  ['Highest Rated', 'rating'],
  ['Recently Uploaded', 'uploaded'],
];
const GENRES: [string, string][] = [
  ['Adventure', 'adventure'],
  ['Beach', 'beach'],
  ['Blackmail', 'blackmail'],
  ['Cheating', 'cheating'],
  ['Comedy', 'comedy'],
  ['Cooking', 'cooking'],
  ['Drama', 'drama'],
  ['Fantasy', 'fantasy'],
  ['Harem', 'harem'],
  ['Historical', 'historical'],
  ['Horror', 'horror'],
  ['Incest', 'incest'],
  ['Mind Break', 'mindbreak'],
  ['Mind Control', 'mindcontrol'],
  ['Monster', 'monster'],
  ['Mystery', 'mystery'],
  ['NTR', 'ntr'],
  ['Psychological', 'psychological'],
  ['Rape', 'rape'],
  ['Reverse Rape', 'reverserape'],
  ['Romance', 'romance'],
  ['School Life', 'schoollife'],
  ['Sci-fi', 'sci-fi'],
  ['Secret Relationship', 'secretrelationship'],
  ['Slice of Life', 'sliceoflife'],
  ['Smut', 'smut'],
  ['Sports', 'sports'],
  ['Supernatural', 'supernatural'],
  ['Tragedy', 'tragedy'],
  ['Yaoi', 'yaoi'],
  ['Yuri', 'yuri'],
  ['Big Boobs', 'bigboobs'],
  ['Black Hair', 'blackhair'],
  ['Blonde Hair', 'blondehair'],
  ['Blue Hair', 'bluehair'],
  ['Brown Hair', 'brownhair'],
  ['Cosplay', 'cosplay'],
  ['Dark Skin', 'darkskin'],
  ['Demon', 'demon'],
  ['Dominant Girl', 'dominantgirl'],
  ['Elf', 'elf'],
  ['Futanari', 'futanari'],
  ['Glasses', 'glasses'],
  ['Green Hair', 'greenhair'],
  ['Gyaru', 'gyaru'],
  ['Inverted Nipples', 'invertednipples'],
  ['Loli', 'loli'],
  ['Maid', 'maid'],
  ['Milf', 'milf'],
  ['Nekomimi', 'nekomimi'],
  ['Nurse', 'nurse'],
  ['Pink Hair', 'pinkhair'],
  ['Pregnant', 'pregnant'],
  ['Purple Hair', 'purplehair'],
  ['Red Hair', 'redhair'],
  ['School Girl', 'schoolgirl'],
  ['Short Hair', 'shorthair'],
  ['Small Boobs', 'smallboobs'],
  ['Succubus', 'succubus'],
  ['Swimsuit', 'swimsuit'],
  ['Teacher', 'teacher'],
  ['Tsundere', 'tsundere'],
  ['Vampire', 'vampire'],
  ['Virgin', 'virgin'],
  ['White Hair', 'whitehair'],
  ['Old', 'old'],
  ['Shota', 'shota'],
  ['Trap', 'trap'],
  ['Ugly Bastard', 'uglybastard'],
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

async function search(page: number, query: string, filters: FilterState): Promise<MangaPage> {
  const genres = (state: string) =>
    Object.entries(filters)
      .filter(([id, v]) => id.startsWith('genre.') && v === state)
      .map(([id]) => id.slice(6))
      .join(',');
  const url = withQuery(`${BASE_URL}/api-search.php`, {
    text: query.trim(),
    order: typeof filters.order === 'string' ? filters.order : '',
    genres: genres('include'),
    blacklist: genres('exclude'),
    page: String(page),
    limit: String(SEARCH_LIMIT),
  });
  const links = (await load(url)).select('div.in-grid > a');
  const items = links.map((a) => {
    let href = a.absUrl('href') || a.attr('href') || '';
    // Some links go through a redirect page ("/fw?to=<url>").
    if (href.includes('/fw?to=')) href = decodeURIComponent(href.split('/fw?to=')[1]!);
    return {
      url: relativeUrl(href),
      title: a
        .select('h3.man-title')
        .map((h) => h.text())
        .join(' '),
      thumbnailUrl: a.selectFirst('img.read-cover')?.attr('src'),
    };
  });
  return { items, hasNextPage: links.length >= SEARCH_LIMIT };
}

// Manga urls are "/manhwa?m=<slug>", chapter urls "...&c=<chapter>".
export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => search(page, '', { order: 'views' }),
    getLatest: (page) => search(page, '', { order: 'uploaded' }),
    search: (query, page, filters) => search(page, query, filters),
    getFilters: (): Filter[] => [
      { type: 'select', id: 'order', label: 'Order by', options: ORDERS.map(([label, value]) => ({ label, value })) },
      {
        type: 'group',
        id: 'genre',
        label: 'Genre',
        filters: GENRES.map(([label, id]) => ({ type: 'tristate', id: `genre.${id}`, label })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const info = document.selectFirst('.manhwa-info-in');
      const h1 = info?.selectFirst('h1');
      const author =
        h1
          ?.select('a.red')
          .map((a) => a.text())
          .join(' ') || undefined;
      const title = h1?.text() ?? manga.title;
      return {
        url: manga.url,
        title: title.includes('By') ? title.slice(0, title.lastIndexOf('By')).trim() : title,
        author,
        artist: author,
        genres: info?.select('.genres h5').map((g) => g.text()),
        description:
          info
            ?.select('.description')
            .map((d) => d.text())
            .join(' ') || undefined,
        thumbnailUrl: document.selectFirst('.cover-img')?.attr('src') || manga.thumbnailUrl,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      return (await load(manga.url)).select('.sort-chapters > a').map((a) => ({
        url: relativeUrl(a.attr('href') ?? ''),
        name: a
          .select('div > h4')
          .map((h) => h.text())
          .join(' '),
        uploadedAt: relativeDate(
          a
            .select('div > h6')
            .map((h) => h.text())
            .join(' '),
          day.getTime(),
        ),
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const param = (name: string) => new RegExp(`[?&]${name}=([^&#]*)`).exec(chapter.url)?.[1] ?? '';
      const document = await load(`${CDN_URL}/manhwa/im.php?f-m=${param('m')}&c=${param('c')}`);
      return document.select('img').map((img, index) => ({ index, imageUrl: img.attr('src') ?? '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/read\.oppai\.stream\/[^?#]*\?(?:.*&)?m=([^&#]+)/i.exec(url.trim());
      return match ? { url: `/manhwa?m=${match[1]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
