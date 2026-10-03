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
import { USER_AGENT, absoluteUrl, parseDate, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://bato1.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const TYPES: [string, string][] = [
  ['Manga', 'manga'],
  ['One Shot', 'one-shot'],
  ['Doujinshi', 'doujinshi'],
  ['Novel', 'novel'],
  ['Manhwa', 'manhwa'],
  ['Manhua', 'manhua'],
];
const GENRES: [string, string][] = [
  ['Action', 'action'],
  ['Adventure', 'adventure'],
  ['Avant Garde', 'avant-garde'],
  ['Boys Love', 'boys-love'],
  ['Comedy', 'comedy'],
  ['Demons', 'demons'],
  ['Drama', 'drama'],
  ['Ecchi', 'ecchi'],
  ['Fantasy', 'fantasy'],
  ['Girls Love', 'girls-love'],
  ['Gourmet', 'gourmet'],
  ['Harem', 'harem'],
  ['Horror', 'horror'],
  ['Isekai', 'isekai'],
  ['Iyashikei', 'iyashikei'],
  ['Josei', 'josei'],
  ['Kids', 'kids'],
  ['Magic', 'magic'],
  ['Mahou Shoujo', 'mahou-shoujo'],
  ['Martial Arts', 'martial-arts'],
  ['Mecha', 'mecha'],
  ['Military', 'military'],
  ['Music', 'music'],
  ['Mystery', 'mystery'],
  ['Parody', 'parody'],
  ['Psychological', 'psychological'],
  ['Reverse Harem', 'reverse-harem'],
  ['Romance', 'romance'],
  ['School', 'school'],
  ['Sci-Fi', 'sci-fi'],
  ['Seinen', 'seinen'],
  ['Shoujo', 'shoujo'],
  ['Shounen', 'shounen'],
  ['Slice of Life', 'slice-of-life'],
  ['Space', 'space'],
  ['Sports', 'sports'],
  ['Super Power', 'super-power'],
  ['Supernatural', 'supernatural'],
  ['Suspense', 'suspense'],
  ['Thriller', 'thriller'],
  ['Vampire', 'vampire'],
];
const STATUSES: [string, string][] = [
  ['Completed', 'completed'],
  ['Releasing', 'releasing'],
  ['On Hiatus', 'on_hiatus'],
  ['Discontinued', 'discontinued'],
  ['Not Yet Published', 'info'],
];
const MIN_CHAPTERS: [string, string][] = [
  ['Any', ''],
  ['>= 1 chapters', '1'],
  ['>= 3 chapters', '3'],
  ['>= 5 chapters', '5'],
  ['>= 10 chapters', '10'],
  ['>= 20 chapters', '20'],
  ['>= 30 chapters', '30'],
  ['>= 50 chapters', '50'],
];
const SORTS: [string, string][] = [
  ['Recently updated', 'recently_updated'],
  ['Recently added', 'recently_added'],
  ['Release date', 'release_date'],
  ['Name A-Z', 'title_az'],
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const image = (img: HtmlElement | null | undefined) => img?.absUrl('data-src') || img?.absUrl('src') || undefined;

async function list(url: string): Promise<MangaPage> {
  const document = await load(url);
  const items = document.select('.original.card-lg .unit').flatMap((unit): MangaSummary[] => {
    const poster = unit.selectFirst('a.poster');
    const title = unit.selectFirst('.info > a')?.text();
    if (!poster || !title) return [];
    return [
      {
        url: relativeUrl(poster.absUrl('href') || poster.attr('href') || ''),
        title,
        thumbnailUrl: image(poster.selectFirst('img')),
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('.pagination a[rel=next]') != null };
}

const slugOf = (url: string) => url.replace(/\/$/, '').split('/').pop() ?? '';
const yearOptions = () => {
  const now = new Date().getFullYear();
  return [
    ...Array.from({ length: now - 2004 }, (_, i) => String(now - i)),
    ...['2000s', '1990s', '1980s', '1970s', '1960s', '1950s', '1940s', '1930s'],
  ];
};

// Manga urls are "/manga/<slug>", chapter urls "/read/<slug>/<chapter slug>".
export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`/filter?sort=views${page > 1 ? `&page=${page}` : ''}`),
    getLatest: (page) => list(page === 1 ? '/updated' : `/updated/page/${page}`),
    search(query: string, page: number, filters: FilterState) {
      const params = [`keyword=${encodeURIComponent(query.trim())}`];
      if (page > 1) params.push(`page=${page}`);
      for (const [id, value] of Object.entries(filters)) {
        const [group, v] = id.split('.');
        if (v !== undefined && value === true) params.push(`${group}[]=${encodeURIComponent(v)}`);
      }
      if (typeof filters.minchap === 'string' && filters.minchap) params.push(`minchap=${filters.minchap}`);
      params.push(`sort=${typeof filters.sort === 'string' && filters.sort ? filters.sort : SORTS[0]![1]}`);
      return list(`/filter?${params.join('&')}`);
    },
    getFilters: (): Filter[] => [
      {
        type: 'group',
        id: 'type',
        label: 'Type',
        filters: TYPES.map(([label, v]) => ({ type: 'checkbox', id: `type.${v}`, label })),
      },
      {
        type: 'group',
        id: 'genre',
        label: 'Genre',
        filters: GENRES.map(([label, v]) => ({ type: 'checkbox', id: `genre.${v}`, label })),
      },
      {
        type: 'group',
        id: 'status',
        label: 'Status',
        filters: STATUSES.map(([label, v]) => ({ type: 'checkbox', id: `status.${v}`, label })),
      },
      {
        type: 'group',
        id: 'year',
        label: 'Year',
        filters: yearOptions().map((y) => ({ type: 'checkbox', id: `year.${y}`, label: y })),
      },
      {
        type: 'select',
        id: 'minchap',
        label: 'Length',
        options: MIN_CHAPTERS.map(([label, value]) => ({ label, value })),
      },
      { type: 'select', id: 'sort', label: 'Sort by', options: SORTS.map(([label, value]) => ({ label, value })) },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const meta = (label: string) =>
        selectIgnoreCase(document, `.meta div:has(span:contains(${label})) a`).map((a) => a.text());
      const statuses: Record<string, MangaStatus> = {
        ongoing: 'ongoing',
        releasing: 'ongoing',
        completed: 'completed',
        'on hiatus': 'hiatus',
        on_hiatus: 'hiatus',
        discontinued: 'cancelled',
        cancelled: 'cancelled',
      };
      return {
        url: manga.url,
        title: document.selectFirst('h1[itemprop=name]')?.text() || manga.title,
        author: meta('Author').join(', ') || undefined,
        description: document.selectFirst('.description')?.text(),
        genres: meta('Genres'),
        status: statuses[document.selectFirst('.info > p')?.text().trim().toLowerCase() ?? ''] ?? 'unknown',
        thumbnailUrl: image(document.selectFirst('.poster img')) ?? manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const slug = slugOf(manga.url);
      const data = (
        await http.get<{ data?: { chapter_name: string; chapter_slug: string; updated_at?: string | null }[] }>(
          `${BASE_URL}/get-chapter-list?slug=${slug}`,
          {
            headers: { ...headers, 'X-Requested-With': 'XMLHttpRequest' },
            responseType: 'json',
          },
        )
      ).body;
      return (data.data ?? []).map((c) => ({
        url: `/read/${slug}/${c.chapter_slug}`,
        name: c.chapter_name,
        uploadedAt: parseDate(c.updated_at, 'yyyy-MM-dd HH:mm:ss'),
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      return (await load(chapter.url))
        .select('.pages .page:not(.notice-page) img')
        .map((img) => image(img))
        .filter((u): u is string => Boolean(u))
        .map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?(?:bato1|bbato)\.com\/(manga|read)\/([^/?#]+)/i.exec(url.trim());
      return match ? { url: `/manga/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
