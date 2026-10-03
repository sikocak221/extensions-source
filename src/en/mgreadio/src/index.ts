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
import { USER_AGENT, absoluteUrl, decodeEntities, hostOf, ownText, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://mgread.io';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const GENRES: [string, string][] = [
  ['Action', 'action'],
  ['Adaptation', 'adaptation'],
  ['Adventure', 'adventure'],
  ['Anime', 'anime'],
  ['Comedy', 'comedy'],
  ['Cooking', 'cooking'],
  ['Crime', 'crime'],
  ['Drama', 'drama'],
  ['Ecchi', 'ecchi'],
  ['Fantasy', 'fantasy'],
  ['Harem', 'harem'],
  ['Historical', 'historical'],
  ['Horror', 'horror'],
  ['Isekai', 'isekai'],
  ['Josei', 'josei'],
  ['Martial Arts', 'martial-arts'],
  ['Mature', 'mature'],
  ['Mecha', 'mecha'],
  ['Medical', 'medical'],
  ['Music', 'music'],
  ['Mystery', 'mystery'],
  ['Romance', 'romance'],
  ['School Life', 'school-life'],
  ['Shoujo', 'shoujo'],
  ['Shounen', 'shounen'],
  ['Slice of life', 'slice-of-life'],
  ['Smut', 'smut'],
  ['Sports', 'sports'],
  ['Supernatural', 'supernatural'],
  ['Webtoons', 'webtoons'],
];

type Options = [string, string][];

const SELECTS: [string, string, Options][] = [
  [
    'type',
    'Type',
    [
      ['All Types', ''],
      ['Comic', 'comic'],
      ['Novel', 'novel'],
      ['Oneshot', 'oneshot'],
    ],
  ],
  [
    'status',
    'Status',
    [
      ['All Status', ''],
      ['Ongoing', 'ongoing'],
      ['Season End', 'season_end'],
      ['Completed', 'completed'],
      ['Source Hiatus', 'source_hiatus'],
      ['Caught Up', 'caught_up'],
      ['Dropped', 'dropped'],
    ],
  ],
  [
    'age_rating',
    'Age Rating',
    [
      ['All Ages', ''],
      ['All ages', 'all'],
      ['13+', '13+'],
      ['16+', '16+'],
      ['18+', '18+'],
    ],
  ],
  [
    'rating_min',
    'Minimum Rating',
    [
      ['Min', '0'],
      ['1 star', '1'],
      ['2 stars', '2'],
      ['3 stars', '3'],
      ['4 stars', '4'],
      ['5 stars', '5'],
    ],
  ],
  [
    'rating_max',
    'Maximum Rating',
    [
      ['Max', '6'],
      ['1 star', '1'],
      ['2 stars', '2'],
      ['3 stars', '3'],
      ['4 stars', '4'],
      ['5 stars', '5'],
    ],
  ],
  [
    'sort',
    'Sort By',
    [
      ['Latest Updated', 'updated'],
      ['Newest', 'new'],
      ['Oldest', 'old'],
      ['Most Views', 'views'],
      ['Daily Views', 'views_day'],
      ['Weekly Views', 'views_week'],
      ['Monthly Views', 'views_month'],
      ['Highest Rating', 'rating'],
      ['Most Power Stone', 'power'],
      ['Most Followers', 'follow'],
    ],
  ],
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function image(el: HtmlElement | null): string | undefined {
  if (!el) return undefined;
  if (el.attr('content') !== undefined && el.attr('src') === undefined) return el.attr('content') || undefined;
  return el.absUrl('data-src') || el.absUrl('data-lazy-src') || el.absUrl('src') || undefined;
}

const isAnime = (m: MangaSummary) =>
  /^anime\s*[-–]/i.test(m.title) || m.url.split('/manga/')[1]?.startsWith('anime-') === true;

function gridItem(el: HtmlElement): MangaSummary | null {
  const link = el.selectFirst("h2 a[href*='/manga/']") ?? el.selectFirst("a[href*='/manga/']:not([href*='/chapter-'])");
  if (!link) return null;
  return {
    url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
    title: link.text(),
    thumbnailUrl: image(el.selectFirst('img')),
  };
}

function gridPage(document: HtmlElement, selector: string): MangaPage {
  const seen = new Set<string>();
  const items = document
    .select(selector)
    .flatMap((el) => gridItem(el) ?? [])
    .filter((m) => !isAnime(m) && !seen.has(m.url) && seen.add(m.url));
  return { items, hasNextPage: document.selectFirst("li:not(.uk-disabled) > a[aria-label='Next page']") != null };
}

const pageUrl = (slug: string, page: number) => (page === 1 ? `/${slug}/` : `/${slug}/page/${page}/`);

function status(text: string | undefined): MangaStatus {
  switch (text?.trim().toLowerCase()) {
    case 'ongoing':
      return 'ongoing';
    case 'completed':
      return 'completed';
    case 'season end':
    case 'source hiatus':
    case 'caught up':
      return 'hiatus';
    case 'dropped':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

function mangaId(document: HtmlElement): number {
  const el = document.selectFirst('#manga-title[data-id], #chapter-search-input[data-manga-id]');
  const id = Number(el?.attr('data-id') || el?.attr('data-manga-id'));
  if (!id) throw new Error('Manga ID not found');
  return id;
}

interface ChapterPage {
  items?: { title?: string; number?: number; slug?: string; created_at?: string }[];
  total_pages?: number;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => gridPage(await load(pageUrl('manga-ranking', page)), '.manga-item-grid'),
    getLatest: async (page) => gridPage(await load(pageUrl('recently-updated', page)), '.manga-item-grid'),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) {
        const response = await http.get(
          `${BASE_URL}/wp-json/initlise/v1/search?term=${encodeURIComponent(query.trim())}&page=${page}`,
          { headers },
        );
        const items = (JSON.parse(response.body) as { title: string; url: string; thumb?: string | null }[])
          .filter((d) => d.url?.trim())
          .map((d) => ({
            url: relativeUrl(d.url.trim()),
            title: decodeEntities(d.title.replace(/<[^>]*>/g, '')).trim(),
            thumbnailUrl: d.thumb || undefined,
          }))
          .filter((m) => !isAnime(m));
        return { items, hasNextPage: false };
      }
      const params: string[] = [];
      for (const [id, , options] of SELECTS)
        params.push(
          `${id}=${encodeURIComponent(typeof filters[id] === 'string' ? (filters[id] as string) : options[0]![1])}`,
        );
      for (const [, value] of GENRES)
        if (filters[`genre.${value}`] === true) params.push(`genre[]=${encodeURIComponent(value)}`);
      const document = await load(`/advanced-filter/${page > 1 ? `page/${page}/` : ''}?${params.join('&')}`);
      return gridPage(document, '.manga-item-grid, .manga-item-details');
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'Filters are only applied when the search text is empty.' },
      ...SELECTS.map(([id, label, options]): Filter => ({
        type: 'select',
        id,
        label,
        options: options.map(([l, v]) => ({ label: l, value: v })),
        default: options[0]![1],
      })),
      {
        type: 'group',
        id: 'genre',
        label: 'Genres',
        filters: GENRES.map(([label, value]) => ({ type: 'checkbox', id: `genre.${value}`, label })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const titleEl = document.selectFirst('#manga-title');
      const title =
        (titleEl ? ownText(titleEl) : '') ||
        document.selectFirst('meta[property=og:title]')?.attr('content')?.split(' [Ch.')[0]?.trim() ||
        manga.title;
      const summary =
        document.selectFirst('#manga-description')?.text().trim() ||
        document.selectFirst('meta[name=description]')?.attr('content')?.trim();
      const metaRow = document.selectFirst('#manga-title + div');
      const chapters = metaRow ? ownText(metaRow).split('Chapters')[0]!.trim() : '';
      const metadata = [
        chapters && `Chapters: ${chapters}`,
        document.selectFirst('#comic-othername')?.text() &&
          `Alternative title: ${document.selectFirst('#comic-othername')!.text()}`,
        document.selectFirst('.init-review-info')?.text() &&
          `Rating: ${document.selectFirst('.init-review-info')!.text()}`,
        metaRow?.selectFirst('.init-plugin-suite-view-count-number')?.text() &&
          `Views: ${metaRow.selectFirst('.init-plugin-suite-view-count-number')!.text()}`,
        document.selectFirst('#last-updated')?.text() &&
          `Last updated: ${document.selectFirst('#last-updated')!.text()}`,
      ].filter(Boolean);
      return {
        url: manga.url,
        title,
        thumbnailUrl: image(document.selectFirst('.story-cover img, meta[property=og:image]')) ?? manga.thumbnailUrl,
        description: [summary, metadata.join('\n')].filter(Boolean).join('\n\n') || undefined,
        genres: document.select("#genre-tags a[href*='/genre/']").map((a) => ownText(a) || a.text()),
        status: status(document.selectFirst('#manga-status')?.text()),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const id = mangaId(await load(manga.url));
      const base = manga.url.split('/chapter/')[0]!.replace(/\/+$/, '');
      const chapters: Chapter[] = [];
      for (let page = 1, total = 1; page <= total; page++) {
        const response = await http.get(
          `${BASE_URL}/wp-json/initmanga/v1/chapters?manga_id=${id}&paged=${page}&per_page=50`,
          { headers },
        );
        const data = JSON.parse(response.body) as ChapterPage;
        total = data.total_pages ?? 1;
        for (const c of data.items ?? []) {
          const number = c.number ?? -1;
          const label = Number.isInteger(number) ? String(number) : String(number);
          chapters.push({
            url: `${base}/${c.slug}/`,
            name: c.title ? `Chapter ${label} - ${c.title}` : `Chapter ${label}`,
            number,
            uploadedAt: parseDate(c.created_at, 'yyyy-MM-dd HH:mm:ss'),
          });
        }
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      return (await load(chapter.url))
        .select('#chapter-content img[data-original-src], #chapter-content img[src]')
        .map((img, index) => ({ index, imageUrl: img.absUrl('data-original-src') || img.absUrl('src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/manga\/[^/?#]+\/)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
