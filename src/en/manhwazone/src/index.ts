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
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://manhwazone.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const GENRES: [string, string][] = [
  ['Action', 'action'],
  ['Adventure', 'adventure'],
  ['Avant Garde', 'avant-garde'],
  ['Award Winning', 'award-winning'],
  ['Boys Love', 'boys-love'],
  ['Comedy', 'comedy'],
  ['Drama', 'drama'],
  ['Fantasy', 'fantasy'],
  ['Girls Love', 'girls-love'],
  ['Gourmet', 'gourmet'],
  ['Horror', 'horror'],
  ['Mystery', 'mystery'],
  ['Romance', 'romance'],
  ['Sci-Fi', 'sci-fi'],
  ['Slice of Life', 'slice-of-life'],
  ['Sports', 'sports'],
  ['Supernatural', 'supernatural'],
  ['Suspense', 'suspense'],
  ['Urban Fantasy', 'urban-fantasy'],
  ['Ecchi', 'ecchi'],
  ['Erotica', 'erotica'],
  ['Hentai', 'hentai'],
  ['Adult Cast', 'adult-cast'],
  ['Anthropomorphic', 'anthropomorphic'],
  ['CGDCT', 'cgdct'],
  ['Childcare', 'childcare'],
  ['Combat Sports', 'combat-sports'],
  ['Crossdressing', 'crossdressing'],
  ['Delinquents', 'delinquents'],
  ['Detective', 'detective'],
  ['Educational', 'educational'],
  ['Gag Humor', 'gag-humor'],
  ['Gore', 'gore'],
  ['Harem', 'harem'],
  ['High Stakes Game', 'high-stakes-game'],
  ['Historical', 'historical'],
  ['Idols (Female)', 'idols-female'],
  ['Idols (Male)', 'idols-male'],
  ['Isekai', 'isekai'],
  ['Iyashikei', 'iyashikei'],
  ['Love Polygon', 'love-polygon'],
  ['Magical Sex Shift', 'magical-sex-shift'],
  ['Mahou Shoujo', 'mahou-shoujo'],
  ['Martial Arts', 'martial-arts'],
  ['Mecha', 'mecha'],
  ['Medical', 'medical'],
  ['Memoir', 'memoir'],
  ['Military', 'military'],
  ['Music', 'music'],
  ['Mythology', 'mythology'],
  ['Organized Crime', 'organized-crime'],
  ['Otaku Culture', 'otaku-culture'],
  ['Parody', 'parody'],
  ['Performing Arts', 'performing-arts'],
  ['Pets', 'pets'],
  ['Psychological', 'psychological'],
  ['Racing', 'racing'],
  ['Reincarnation', 'reincarnation'],
  ['Reverse Harem', 'reverse-harem'],
  ['Romantic Subtext', 'romantic-subtext'],
  ['Samurai', 'samurai'],
  ['School', 'school'],
  ['Showbiz', 'showbiz'],
  ['Space', 'space'],
  ['Strategy Game', 'strategy-game'],
  ['Super Power', 'super-power'],
  ['Survival', 'survival'],
  ['Team Sports', 'team-sports'],
  ['Time Travel', 'time-travel'],
  ['Vampire', 'vampire'],
  ['Video Game', 'video-game'],
  ['Villainess', 'villainess'],
  ['Visual Arts', 'visual-arts'],
  ['Workplace', 'workplace'],
  ['Josei', 'josei'],
  ['Kids', 'kids'],
  ['Seinen', 'seinen'],
  ['Shoujo', 'shoujo'],
  ['Shounen', 'shounen'],
];

const SORTS: [string, string][] = [
  ['Popularity', 'popularity'],
  ['Latest', 'latest'],
  ['Rank', 'rank'],
  ['Score', 'score'],
  ['Follower', 'follower'],
  ['A → Z', 'name_asc'],
  ['Z → A', 'name_desc'],
];

const STATUSES: [string, string][] = [
  ['All Status', ''],
  ['Finished', 'finished'],
  ['On Hiatus', 'on_hiatus'],
  ['On Going', 'currently_publishing'],
  ['Discontinued', 'discontinued'],
];

interface Loaded {
  document: HtmlElement;
  cookie: string;
}

async function fetchDocument(url: string): Promise<Loaded> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  const setCookie = Object.entries(response.headers).find(([name]) => name.toLowerCase() === 'set-cookie')?.[1] ?? '';
  const cookie = [...setCookie.matchAll(/(?:^|[,\n]\s*)([\w-]+)=([^;,\n]*)/g)].map((m) => `${m[1]}=${m[2]}`).join('; ');
  return { document: html.load(response.body, { baseUrl: response.url }), cookie };
}

async function list(url: string): Promise<MangaPage> {
  const { document } = await fetchDocument(url);
  const items = document.select('article.group').flatMap((el): MangaSummary[] => {
    const link = el.selectFirst('a');
    const title = el.selectFirst('.min-w-0 > a.font-semibold')?.text();
    if (!link || !title) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title,
        thumbnailUrl: el.selectFirst('img')?.absUrl('src') || undefined,
      },
    ];
  });
  return {
    items,
    hasNextPage: document.selectFirst('a[rel=next], nav a:contains(›)') != null || items.length >= 24,
  };
}

function status(text: string | undefined): MangaStatus {
  switch (text?.trim().toLowerCase()) {
    case 'on going':
    case 'ongoing':
    case 'currently publishing':
      return 'ongoing';
    case 'completed':
    case 'finished':
      return 'completed';
    case 'on hiatus':
      return 'hiatus';
    case 'discontinued':
    case 'cancelled':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

interface ChapterDto {
  name?: string;
  published?: string;
  web_url?: string;
}

/** Chapters load through a Livewire "bootLoad" call on the series page. */
async function livewireChapters({ document, cookie }: Loaded): Promise<Chapter[]> {
  const wire = document.selectFirst('div[wire\\:snapshot][wire\\:id][wire\\:init=bootLoad]');
  if (!wire) return [];
  const response = await http.request<string>({
    url: `${BASE_URL}/livewire/update`,
    method: 'POST',
    headers: {
      ...headers,
      Accept: 'application/json',
      'X-Livewire': '',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: {
      json: {
        _token: document.selectFirst('meta[name=csrf-token]')?.attr('content') ?? '',
        components: [
          {
            snapshot: wire.attr('wire:snapshot') ?? '',
            updates: {},
            calls: [{ path: '', method: 'bootLoad', params: [] }],
          },
        ],
      },
    },
    responseType: 'text',
  });
  if (response.status !== 200) return [];
  const snapshot = (JSON.parse(response.body) as { components?: { snapshot?: string }[] }).components?.[0]?.snapshot;
  if (!snapshot) return [];
  // Livewire serializes collections as [value, meta] tuples.
  const tuples = (JSON.parse(snapshot) as { data?: { chapters?: [[ChapterDto, unknown][], unknown] } }).data
    ?.chapters?.[0];
  return (tuples ?? []).flatMap(([dto]): Chapter[] =>
    dto?.web_url
      ? [
          {
            url: relativeUrl(dto.web_url),
            name: dto.name ?? 'Chapter',
            uploadedAt: parseDate(dto.published, 'yyyy-MM-dd HH:mm:ss'),
          },
        ]
      : [],
  );
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`/series?sortBy=popularity&page=${page}`),
    getLatest: (page) => list(`/series?sortBy=latest&page=${page}`),
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params = [`page=${page}`];
      if (query.trim()) params.push(`keyword=${encodeURIComponent(query.trim())}`);
      params.push(`sortBy=${typeof filters.sortBy === 'string' ? filters.sortBy : 'popularity'}`);
      if (typeof filters.status === 'string' && filters.status) params.push(`status=${filters.status}`);
      const genres = GENRES.filter(([, slug]) => filters[`genre.${slug}`] === true).map(([, slug]) => slug);
      if (genres.length) params.push(`genres=${genres.join('_')}`);
      return list(`/series?${params.join('&')}`);
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'sortBy',
        label: 'Sort By',
        options: SORTS.map(([label, value]) => ({ label, value })),
        default: 'popularity',
      },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: STATUSES.map(([label, value]) => ({ label, value })),
        default: '',
      },
      {
        type: 'group',
        id: 'genre',
        label: 'Genres',
        filters: GENRES.map(([label, slug]) => ({ type: 'checkbox', id: `genre.${slug}`, label })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await fetchDocument(manga.url);
      const jsonLd = document.selectFirst('script[type=application/ld+json]')?.html() ?? '';
      const author = /"author":\s*\[\s*\{"@type":"Person","name":"([^"]+)"/.exec(jsonLd)?.[1];
      return {
        url: manga.url,
        title: document.selectFirst('h1.page-title')?.text() || manga.title,
        description: document.selectFirst('p.page-subtitle')?.text() || undefined,
        thumbnailUrl:
          document.selectFirst('img.aspect-\\[7\\/10\\], figure.relative img')?.absUrl('src') || manga.thumbnailUrl,
        genres: document.select('a.badge-genre').map((a) => a.text()),
        status: status(
          document.selectFirst('span.badge-sm, span:contains(On Going), span:contains(Completed)')?.text(),
        ),
        author: author && author.toLowerCase() !== 'unknown' ? author : undefined,
      };
    },
    getChapters: async (manga: MangaSummary): Promise<Chapter[]> => livewireChapters(await fetchDocument(manga.url)),
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document } = await fetchDocument(chapter.url);
      return document
        .select('img.lazy-image[data-src]')
        .map((img, index) => ({ index, imageUrl: img.absUrl('data-src') || img.attr('data-src') || '' }));
    },
    // The image CDN (manhwatop) answers 403 to the site's Referer and wants its own.
    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: 'https://manhwatop.com/' }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/series\/[^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
