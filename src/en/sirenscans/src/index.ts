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
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://sirenscans.org';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const SHOW_LOCKED_PREFERENCE: Preference = {
  type: 'switch',
  key: 'pref_show_locked_chap',
  label: 'Show locked chapters',
  default: false,
};

type Options = [string, string][];

const TYPES: Options = [
  ['All', ''],
  ['Manhwa', 'manhwa'],
  ['Manhua', 'manhua'],
  ['Mangatoon', 'mangatoon'],
  ['Manga', 'manga'],
  ['Novel', 'novel'],
];

const STATUSES: Options = [
  ['All', ''],
  ['Ongoing', 'ongoing'],
  ['Completed', 'completed'],
];

const SORTS: Options = [
  ['Latest', 'latest'],
  ['Trending', 'trending'],
  ['Popular', 'popular'],
  ['Most Viewed', 'views'],
  ['Top Rated', 'rating'],
  ['A-Z', 'az'],
  ['Z-A', 'za'],
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const image = (img: HtmlElement | null) => (img ? img.absUrl('data-src') || img.absUrl('src') || undefined : undefined);

// The site lists about 40 series per view and has no pagination.
async function list(url: string, page: number): Promise<MangaPage> {
  if (page > 1) return { items: [], hasNextPage: false };
  const items = (await load(url)).select('div.grid a.group[href]').flatMap((a): MangaSummary[] => {
    const title = a.selectFirst('h2')?.text().trim();
    if (!title) return [];
    return [
      { url: relativeUrl(a.absUrl('href') || a.attr('href') || ''), title, thumbnailUrl: image(a.selectFirst('img')) },
    ];
  });
  return { items, hasNextPage: false };
}

async function seriesIds(url: string): Promise<{ document: HtmlElement; uid: string; slug: string }> {
  const document = await load(url);
  const div = document.selectFirst('div#chapters-list');
  return { document, uid: div?.attr('data-series-uid') ?? '', slug: div?.attr('data-series-slug') ?? '' };
}

export default defineExtension({
  preferences: () => [SHOW_LOCKED_PREFERENCE],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list('/?browse=1&sort=popular', page),
    getLatest: (page) => list('/?browse=1', page),
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params: string[] = [];
      if (query.trim()) params.push(`q=${encodeURIComponent(query.trim())}`);
      params.push('browse=1');
      for (const id of ['type', 'status'])
        if (typeof filters[id] === 'string' && filters[id]) params.push(`${id}=${filters[id]}`);
      for (const [id, value] of Object.entries(filters))
        if (id.startsWith('tag.') && value === true) params.push(`tag[]=${encodeURIComponent(id.slice(4))}`);
      if (typeof filters.sort === 'string' && filters.sort !== 'latest') params.push(`sort=${filters.sort}`);
      return list(`/?${params.join('&')}`, page);
    },
    async getFilters(): Promise<Filter[]> {
      const select = (id: string, label: string, options: Options): Filter => ({
        type: 'select',
        id,
        label,
        options: options.map(([l, v]) => ({ label: l, value: v })),
        default: options[0]![1],
      });
      const filters = [
        select('type', 'Type', TYPES),
        select('status', 'Status', STATUSES),
        select('sort', 'Sort by', SORTS),
      ];
      const response = await http.request<string>({ url: `${BASE_URL}/?browse=1`, headers });
      if (response.status !== 200) return filters;
      const genres = html
        .load(response.body)
        .select('div#search-genres-list a.genre-tag[data-tag]')
        .map((a) => {
          const name = a.text().trim();
          return {
            type: 'checkbox' as const,
            id: `tag.${a.attr('data-tag')}`,
            label: name.charAt(0).toUpperCase() + name.slice(1),
          };
        });
      return genres.length ? [...filters, { type: 'group', id: 'tag', label: 'Genres', filters: genres }] : filters;
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await seriesIds(manga.url);
      const meta = (label: string) =>
        document
          .select(`div.flex.items-center.justify-between:has(span:contains(${label})) > span`)
          .at(-1)
          ?.text()
          .trim() || undefined;
      const status = document
        .select('div:has(> div.text-xs:contains(Status)) span')
        .at(-1)
        ?.text()
        .trim()
        .toLowerCase();
      return {
        url: manga.url,
        title: document.selectFirst('h1')?.text().trim() || manga.title,
        description:
          document
            .selectFirst('p#series-desc')
            ?.text()
            .trim()
            .replace(/^[" ]+|[" ]+$/g, '') || undefined,
        thumbnailUrl: image(document.selectFirst('div[style*=aspect-ratio] img')) ?? manga.thumbnailUrl,
        genres: document.select('div.flex.flex-wrap.-mx-1 a[href*=tag]').map((a) => a.text()),
        author: meta('Author'),
        artist: meta('Artist'),
        status:
          status === 'ongoing'
            ? 'ongoing'
            : status === 'completed'
              ? 'completed'
              : status === 'hiatus'
                ? 'hiatus'
                : 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { uid, slug } = await seriesIds(manga.url);
      if (!uid || !slug) throw new Error(`Could not find series ID for: ${manga.url}`);
      const response = await http.get(
        `${BASE_URL}/?_chapters_html=1&series_uid=${encodeURIComponent(uid)}&series_slug=${encodeURIComponent(slug)}`,
        { headers },
      );
      const rows = (JSON.parse(response.body) as { rows_html: string }).rows_html;
      const showLocked = prefs.get<boolean>(SHOW_LOCKED_PREFERENCE.key) ?? false;
      return html
        .load(rows, { baseUrl: BASE_URL })
        .select('a.chapter-row[href]')
        .filter((a) => showLocked || a.attr('data-ch-locked') !== '1')
        .map((a) => ({
          url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
          name: (a.attr('data-ch-label') ?? '').trim(),
          uploadedAt: parseDate(a.selectFirst('.ch-date-row span:last-child')?.text(), 'MMM d, yyyy'),
        }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      return (await load(chapter.url))
        .select('div#strip-reader img.reader-page')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.attr('src') || '' }));
    },
    imageHeaders: () => headers,
    // The CDN labels its JPEGs text/plain; an empty transform lets the host sniff the real type.
    transformImage: () => ({}),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[^/?#]+)\/?(?:[?#]|$)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
