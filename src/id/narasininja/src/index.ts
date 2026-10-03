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
import { USER_AGENT, hostOf, parseDate, relativeUrl, selectFirstIgnoreCase } from './common/utils';

const BASE_URL = 'https://narasininja.net';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface FilterResponse {
  data: { title: string; slug: string }[];
  meta: { current_page: number; last_page: number };
}

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function toStatus(text: string | undefined): MangaStatus {
  if (!text) return 'unknown';
  if (/ongoing/i.test(text)) return 'ongoing';
  if (/completed|finished|tamat/i.test(text)) return 'completed';
  if (/hiatus|on.hold/i.test(text)) return 'hiatus';
  if (/cancelled|canceled|dropped/i.test(text)) return 'cancelled';
  return 'unknown';
}

// The filter endpoint is a Laravel POST that needs the page's CSRF token and its session cookies
// (refreshed on HTTP 419). The cookies are passed by hand in case the host keeps no cookie jar.
let csrfToken: string | null = null;
let cookies = '';

async function token(): Promise<string> {
  if (csrfToken) return csrfToken;
  const response = await http.get(`${BASE_URL}/komik`, { headers });
  const value = html.load(response.body).selectFirst('meta[name=csrf-token]')?.attr('content');
  if (!value) throw new Error('CSRF token tidak ditemukan');
  const setCookie = Object.entries(response.headers).find(([name]) => name.toLowerCase() === 'set-cookie')?.[1] ?? '';
  cookies = [...setCookie.matchAll(/(?:^|,\s*|\n)([A-Za-z0-9_-]+=[^;,\n]*)/g)].map((m) => m[1]).join('; ');
  csrfToken = value;
  return value;
}

async function postFilter(page: number, form: Record<string, string>): Promise<FilterResponse> {
  const send = async () => {
    const csrf = await token();
    return http.request<string>({
      url: `${BASE_URL}/komik/filter?page=${page}`,
      method: 'POST',
      body: { form },
      headers: {
        ...headers,
        Referer: `${BASE_URL}/komik`,
        'X-CSRF-TOKEN': csrf,
        'X-Requested-With': 'XMLHttpRequest',
        ...(cookies ? { Cookie: cookies } : {}),
      },
    });
  };
  let response = await send();
  if (response.status === 419) {
    csrfToken = null;
    response = await send();
  }
  if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
  return JSON.parse(response.body) as FilterResponse;
}

const option = (label: string, value: string) => ({ label, value });
const GENRES: [string, string][] = [["4-Koma", "92"],["Action", "2"],["Adaptation", "74"],["Adult", "67"],["Adventure", "3"],["Animals", "117"],["Anthology", "158"],["Antihero", "125"],["apocalypse", "87"],["Award Winning", "149"],["Beasts", "97"],["Bodyswap", "132"],["Boys' Love", "94"],["Bully", "114"],["Cartoon", "133"],["Childhood Friends", "113"],["Comedy", "4"],["Comic", "78"],["Cooking", "5"],["Crime", "6"],["Crossdressing", "62"],["Dance", "146"],["Dark Fantasy", "105"],["Delinquent", "115"],["Delinquents", "91"],["Dementia", "134"],["Demon", "64"],["Demons", "8"],["Doujinshi", "119"],["Drama", "9"],["Dungeons", "135"],["Ecchi", "12"],["Emperor's daughter", "127"],["Entertainment", "89"],["Fan-Colored", "128"],["Fantas", "80"],["Fantasy", "13"],["Fetish", "136"],["Full Color", "75"],["Game", "14"],["Games", "163"],["Gang", "122"],["Gender Bender", "15"],["Genderswap", "106"],["Ghosts", "129"],["Girls", "82"],["Girls' Love", "69"],["gore", "68"],["gorre", "154"],["Gyaru", "111"],["Harem", "17"],["Hentai", "112"],["Hero", "99"],["Historical", "18"],["Horror", "19"],["Imageset", "137"],["Incest", "126"],["Isekai", "20"],["Josei", "21"],["Josei(W)", "118"],["Kids", "130"],["Leveling", "164"],["Loli", "150"],["Lolicon", "73"],["Long Strip", "76"],["Mafia", "151"],["Magi", "152"],["Magic", "23"],["Magical Girls", "116"],["Martial Art", "101"],["Martial Arts", "26"],["Mature", "27"],["Mecha", "28"],["Medical", "29"],["Military", "30"],["Mirror", "110"],["Modern", "159"],["Monster Girls", "153"],["Monsters", "96"],["Murim", "79"],["Music", "31"],["Mystery", "32"],["Necromancer", "160"],["Ninja", "138"],["Non-human", "139"],["Office Workers", "103"],["Official Colored", "156"],["One-Shot", "84"],["Oneshot", "147"],["Overpowered", "161"],["Parody", "140"],["Pets", "162"],["Philosophical", "102"],["Police", "36"],["Post-Apocalyptic", "104"],["Project", "66"],["Psychological", "37"],["Regression", "70"],["Reincarnation", "39"],["Revenge", "65"],["Reverse Harem", "71"],["Reverse Isekai", "141"],["Romance", "40"],["Royalty", "142"],["School", "41"],["School life", "42"],["Sci-fi", "44"],["Seinen", "45"],["Seinen(M)", "148"],["Seinin", "123"],["Sexual Violence", "85"],["Shotacon", "46"],["Shoujo", "47"],["Shoujo Ai", "48"],["Shoujo(G)", "121"],["Shounen", "49"],["Shounen Ai", "50"],["Shounen(B)", "98"],["Shounn", "165"],["Showbiz", "143"],["Slice of Life", "51"],["Smut", "72"],["Space", "144"],["Sport", "52"],["Sports", "53"],["Super Power", "54"],["Superhero", "93"],["Supernatural", "55"],["Supranatural", "95"],["Survival", "63"],["System", "88"],["Thriller", "56"],["Time Travel", "83"],["Traditional Games", "145"],["Tragedy", "57"],["Transmigration", "131"],["Vampire", "59"],["Vampires", "107"],["Video Games", "108"],["Villainess", "100"],["Violence", "157"],["Virtual Reality", "109"],["Web Comic", "77"],["Webtoon", "90"],["Webtoons", "60"],["Wuxia", "81"],["Xianxia", "124"],["Xuanhuan", "120"],["Yaoi", "155"],["Yuri", "61"],["Zombies", "86"],]; // prettier-ignore

async function search(page: number, query: string, state: FilterState): Promise<MangaPage> {
  const text = (id: string) => (typeof state[id] === 'string' ? (state[id] as string) : '');
  const form: Record<string, string> = {
    search: query.trim(),
    status: text('status'),
    type: text('type'),
    order: text('order') || 'update',
  };
  // A form object cannot repeat keys: genres go in as genre[0], genre[1], … (PHP reads both forms).
  GENRES.filter(([, id]) => state[`genre.${id}`] === true).forEach(([, id], i) => (form[`genre[${i}]`] = id));
  const result = await postFilter(page, form);
  return {
    items: result.data.map((m) => ({
      url: `/komik/${m.slug}`,
      title: m.title,
      thumbnailUrl: `${BASE_URL}/storage/comic/image-bg/${m.slug}.jpg`,
    })),
    hasNextPage: result.meta.current_page < result.meta.last_page,
  };
}

function chapterNumber(raw: string): number | undefined {
  const match = /(\d+)(?:[._-](\d+))?/.exec(raw.trim());
  if (!match) return undefined;
  return Number.parseFloat(match[2] ? `${match[1]}.${match[2]}` : match[1]!);
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    getPopular: (page) => search(page, '', {}),

    search: (query, page, state) => search(page, query, state),

    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'order',
        label: 'Order',
        options: [
          option('Update', 'update'),
          option('Added', 'added'),
          option('A-Z', 'title'),
          option('Z-A', 'titlereverse'),
        ],
      },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [
          option('All', ''),
          option('Ongoing', 'ongoing'),
          option('Completed', 'completed'),
          option('Hiatus', 'hiatus'),
        ],
      },
      {
        type: 'select',
        id: 'type',
        label: 'Type',
        options: [
          option('All', ''),
          ...['Manga', 'Manhwa', 'Manhua', 'Comic', 'Novel'].map((t) => option(t, t.toLowerCase())),
        ],
      },
      { type: 'separator' },
      {
        type: 'group',
        id: 'genre',
        label: 'Genre',
        filters: GENRES.map(([label, id]) => ({ type: 'checkbox', id: `genre.${id}`, label })),
      },
    ],

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}`);
      const cell = (label: string) => {
        const value = selectFirstIgnoreCase(document, `.infotable tr:contains(${label}) td:last-child`)?.text();
        return value && value !== '-' ? value : undefined;
      };
      return {
        url: manga.url,
        title: document.selectFirst('h1.entry-title')?.text() || manga.title,
        thumbnailUrl: document.selectFirst('.thumb img')?.absUrl('src') || manga.thumbnailUrl,
        description: document.selectFirst('.entry-content.entry-content-single p')?.text() || undefined,
        status: toStatus(cell('Status')),
        genres: document.select('.seriestugenre a').map((a) => a.text()),
        author: cell('Author'),
        artist: cell('Artist'),
      };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}`);
      const seen = new Set<string>();
      const chapters = document.select('#chapterlist li, .eplister li').flatMap((li): Chapter[] => {
        const link = li.selectFirst('a');
        const name = li.selectFirst('.chapternum')?.text() || link?.text();
        if (!link || !name) return [];
        const url = relativeUrl(link.absUrl('href') || link.attr('href') || '');
        if (seen.has(url)) return [];
        seen.add(url);
        const date = parseDate(li.selectFirst('.chapterdate')?.text(), 'MMMM d, yyyy');
        return [
          {
            url,
            name,
            number: chapterNumber(li.attr('data-num') || name.split(' ').pop() || ''),
            uploadedAt: date === undefined ? undefined : date - 7 * 3_600_000, // Asia/Jakarta
          },
        ];
      });
      return chapters.sort((a, b) => (b.number ?? -1) - (a.number ?? -1));
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await fetchDocument(`${BASE_URL}${chapter.url}`);
      const urls = document
        .select('#readerarea img.ts-main-image, #readerarea img')
        .map((img) => img.absUrl('src') || img.absUrl('data-src') || '')
        .filter(Boolean);
      return [...new Set(urls)].map((imageUrl, index) => ({ index, imageUrl }));
    },

    imageHeaders: () => headers,

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/(?:[^?#]*\/)?komik\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]?.toLowerCase().replace(/^www\./, '') === hostOf(BASE_URL)
        ? { url: `/komik/${match[2]}`, title: '' }
        : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
