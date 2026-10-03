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
import { decryptData } from './decrypt';

const BASE_URL = 'https://hentainexus.com';
const POPULAR_NOW_PATH = '/explore/hot';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const IMAGE_FORMAT_PREFERENCE: Preference = {
  type: 'select',
  key: 'pref_image_format',
  label: 'Image quality (Original requires a user account)',
  options: [
    { label: 'Original', value: 'source' },
    { label: 'WebP', value: 'webp' },
    { label: 'AVIF', value: 'avif' },
  ],
  default: 'webp',
};

const IMAGE_FIELDS: Record<string, string> = { source: 'image_source', avif: 'image_avif' };

const ADVANCED: [string, string][] = [
  ['tag', 'Tags'],
  ['artist', 'Artists'],
  ['author', 'Authors'],
  ['circle', 'Circles'],
  ['event', 'Events'],
  ['parody', 'Parodies'],
  ['magazine', 'Magazines'],
  ['publisher', 'Publishers'],
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

async function list(url: string, alwaysNext = false): Promise<MangaPage> {
  const document = await load(url);
  const items = document.select('.container .column').flatMap((el): MangaSummary[] => {
    const link = el.selectFirst('a');
    const title = el.selectFirst('.card-header-title')?.text();
    if (!link || !title) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title,
        thumbnailUrl: el.selectFirst('.card-image img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: alwaysNext || document.selectFirst('a.pagination-next[href]') != null };
}

/** Splits `a, -b, "c d"` on the commas outside quotes. */
function splitTokens(state: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quoted = false;
  for (const ch of state) {
    if (ch === '"') quoted = !quoted;
    if (ch === ',' && !quoted) {
      if (current.trim()) tokens.push(current.trim());
      current = '';
    } else current += ch;
  }
  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

function combineQuery(filters: FilterState): string {
  return ADVANCED.flatMap(([key]) =>
    splitTokens(typeof filters[key] === 'string' ? (filters[key] as string) : '').map((token) =>
      token.startsWith('-') ? `-${key}:${token.slice(1)} ` : `${key}:${token} `,
    ),
  ).join('');
}

function search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
  const offset = Number.parseInt(typeof filters.offset === 'string' ? filters.offset : '', 10) || 0;
  const actualPage = page + offset;
  const q = encodeURIComponent((combineQuery(filters) + query).trim());
  return list(`${actualPage > 1 ? `/page/${actualPage}` : '/'}?q=${q}`);
}

export default defineExtension({
  preferences: () => [IMAGE_FORMAT_PREFERENCE],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => (page > 1 ? search('sort:popular', page - 1, {}) : list(POPULAR_NOW_PATH, true)),
    getLatest: (page) => list(page > 1 ? `/page/${page}` : '/'),
    search,
    getFilters: (): Filter[] => [
      {
        type: 'header',
        label:
          'Separate items with commas (,). Prepend with dash (-) to exclude. Surround multi-word items with double quotes (").',
      },
      ...ADVANCED.map(([id, label]): Filter => ({ type: 'text', id, label })),
      { type: 'separator' },
      { type: 'text', id: 'offset', label: 'Offset results by # pages' },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const table = document.selectFirst('.view-page-details');
      const people = (label: string) =>
        table?.select(`td.viewcolumn:contains(${label}) + td a`).map((a) => ownText(a)) ?? [];
      const lines: string[] = [];
      for (const key of ['Circle', 'Event', 'Magazine', 'Parody', 'Publisher', 'Pages', 'Favorites']) {
        const cell = table?.selectFirst(`td.viewcolumn:contains(${key}) + td`);
        if (!cell) continue;
        const link = cell.selectFirst('a');
        lines.push(`${key}: ${ownText(cell) || (link ? ownText(link) : '')}`);
      }
      const summary = table?.selectFirst('td.viewcolumn:contains(Description) + td')?.text();
      if (summary) lines.push('', summary);
      const authors = [...new Set([...people('Author'), ...people('Artist')])];
      return {
        url: manga.url,
        title: document.selectFirst('h1.title')?.text() || manga.title,
        author: authors.join(', ') || undefined,
        description: lines.join('\n').trim() || undefined,
        genres: table?.select('span.tag a').map((a) => a.text().replace(/\s*\([\d,]+\)$/, '')) ?? [],
        status: 'completed',
        thumbnailUrl: document.selectFirst('figure.image img')?.attr('src') || manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      const published = document.selectFirst('.view-page-details td.viewcolumn:contains(Published) + td')?.text();
      const id = manga.url.replace(/\/+$/, '').split('/').pop();
      return [{ url: `/read/${id}`, name: 'Chapter', uploadedAt: parseDate(published, 'd MMMM yyyy') }];
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      const script = document
        .select('script')
        .map((s) => s.html())
        .find((s) => s.includes('initReader'));
      if (!script) throw new Error('Could not find initReader script; the page structure may have changed');
      const encoded = script.split('initReader("')[1]?.split('",')[0] ?? '';
      const images = (JSON.parse(decryptData(encoded)) as Record<string, string>[]).filter((p) => p.type === 'image');
      if (images.length === 0) return [];
      const format = prefs.get<string>(IMAGE_FORMAT_PREFERENCE.key) ?? 'webp';
      const field = IMAGE_FIELDS[format] ?? 'image_fallback';
      if (images[0]![field] == null)
        throw new Error(`Selected quality '${format}' is not available. Login or select another quality.`);
      return images.map((p, index) => ({ index, imageUrl: p[field]! }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/(?:view|read)\/(\d+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/view/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
