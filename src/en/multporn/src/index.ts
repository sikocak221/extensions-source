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
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://multporn.net';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

type Kind = 'popular' | 'latest' | 'search';
type Options = [string, string][];

const SORT_BY: [Kind, string, string][] = [
  ['popular', 'Total Views', 'totalcount_1'],
  ['popular', 'Views Today', 'daycount'],
  ['popular', 'Last Viewed', 'timestamp'],
  ['latest', 'Date Posted', 'created'],
  ['latest', 'Date Updated', 'changed'],
  ['search', 'Relevance', 'search_api_relevance'],
  ['search', 'Author', 'author'],
];

const POPULAR_TYPES: Options = [
  ['Comics', '1'],
  ['Hentai Manga', '2'],
  ['Cartoon Pictures', '3'],
  ['Hentai Pictures', '4'],
  ['Rule 63', '10'],
  ['Author Albums', '11'],
];

const LATEST_TYPES: Options = [
  ['Comics', '1'],
  ['Hentai Manga', '2'],
  ['Cartoon Pictures', '3'],
  ['Hentai Pictures', '4'],
  ['Author Albums', '10'],
];

const SEARCH_TYPES: Options = [
  ['Comics', '1'],
  ['Hentai Manga', '2'],
  ['Gay Comics', '3'],
  ['Cartoon Pictures', '4'],
  ['Hentai Pictures', '5'],
  ['Rule 63', '11'],
  ['Humor', '13'],
];

const TEXT_SEARCHES: [string, string][] = [
  ['category', 'Comic Tags'],
  ['characters', 'Comic Characters'],
  ['authors_comics', 'Comic Authors'],
  ['comics', 'Comic Sections'],
  ['category_hentai', 'Manga Categories'],
  ['characters_hentai', 'Manga Characters'],
  ['authors_hentai_comics', 'Manga Authors'],
  ['hentai_manga', 'Manga Sections'],
  ['authors_albums', 'Picture Authors'],
  ['pictures', 'Picture Sections'],
  ['hentai', 'Hentai Sections'],
  ['rule_63', 'Rule 63 Sections'],
  ['category_gay', 'Gay Tags'],
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function summary(el: HtmlElement): MangaSummary | null {
  const link = el.selectFirst('.views-field-title a');
  if (!link) return null;
  return {
    url: relativeUrl(link.absUrl('href') || link.attr('href') || '').split('?')[0]!,
    title: el
      .select('.views-field-title')
      .map((e) => e.text())
      .join(' '),
    thumbnailUrl: el.selectFirst('img')?.absUrl('src') || undefined,
  };
}

function parseList(document: HtmlElement, selector: string): MangaPage {
  const items = document.select(selector).flatMap((el) => summary(el) ?? []);
  return { items, hasNextPage: document.selectFirst('.pager-next a') != null };
}

const value = (filters: FilterState, id: string, fallback: string) =>
  typeof filters[id] === 'string' && filters[id] ? (filters[id] as string) : fallback;

async function browse(kind: 'popular' | 'latest', page: number, filters: FilterState): Promise<MangaPage> {
  const params = [
    `page=${page - 1}`,
    `sort_by=${value(filters, 'sort_by', kind === 'popular' ? 'totalcount_1' : 'created')}`,
    `sort_order=${value(filters, 'sort_order', 'DESC')}`,
    `type=${value(filters, kind === 'popular' ? 'popular_type' : 'latest_type', '1')}`,
  ];
  return parseList(await load(`/${kind === 'popular' ? 'best' : 'new'}?${params.join('&')}`), '.masonry-item');
}

/** "Big Tits, Milf" → ["big_tits", "milf"]. */
const slugs = (state: string) => [
  ...new Set(
    state
      .split(',')
      .filter(Boolean)
      .map((s) =>
        s
          .replace(/[^A-Za-z0-9]/g, ' ')
          .trim()
          .replace(/\s+/g, '_')
          .toLowerCase(),
      )
      .filter(Boolean),
  ),
];

/** The gallery sits inside <noscript>, which the parser keeps as text. */
function galleryImages(document: HtmlElement): HtmlElement[] {
  const direct = document.select('.jb-image img');
  if (direct.length > 0) return direct;
  return document
    .select('noscript')
    .map((n) => n.html())
    .filter((inner) => inner.includes('jb-image'))
    .flatMap((inner) => html.load(inner, { baseUrl: BASE_URL }).select('.jb-image img'));
}

async function textSearch(page: number, filters: FilterState): Promise<MangaPage> {
  const items: MangaSummary[] = [];
  const seen = new Set<string>();
  let hasNextPage = false;
  for (const [uri] of TEXT_SEARCHES) {
    for (const slug of slugs(typeof filters[uri] === 'string' ? (filters[uri] as string) : '')) {
      const response = await http.request({ url: `${BASE_URL}/${uri}/${slug}?page=0,${page - 1}`, headers });
      if (response.status !== 200) continue;
      const result = parseList(
        html.load(response.body as string, { baseUrl: response.url }),
        '#content .col-1:contains(Views:), .col-2:contains(Views:)',
      );
      hasNextPage ||= result.hasNextPage;
      for (const item of result.items) {
        if (seen.has(item.url)) continue;
        seen.add(item.url);
        items.push(item);
      }
    }
  }
  return { items, hasNextPage };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => browse('popular', page, {}),
    getLatest: (page) => browse('latest', page, {}),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (TEXT_SEARCHES.some(([uri]) => typeof filters[uri] === 'string' && (filters[uri] as string).trim()))
        return textSearch(page, filters);
      const sortBy = value(filters, 'sort_by', 'totalcount_1');
      const kind = SORT_BY.find(([, , uri]) => uri === sortBy)?.[0] ?? 'popular';
      if (query.trim() || kind === 'search') {
        const params = [
          `page=${page - 1}`,
          `search_api_views_fulltext=${encodeURIComponent(query.trim())}`,
          `sort_by=${kind === 'search' ? sortBy : 'search_api_relevance'}`,
          `type=${value(filters, 'search_type', '1')}`,
        ];
        return parseList(await load(`/search?${params.join('&')}`), '.masonry-item');
      }
      return browse(kind, page, filters);
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'Text search only works with Relevance and Author' },
      {
        type: 'select',
        id: 'sort_by',
        label: 'Sort By',
        options: SORT_BY.map(([kind, label, uri]) => ({
          label: `[${kind[0]!.toUpperCase()}${kind.slice(1)}] ${label}`,
          value: uri,
        })),
        default: 'totalcount_1',
      },
      { type: 'header', label: 'Order By only works with Popular and Latest' },
      {
        type: 'select',
        id: 'sort_order',
        label: 'Order By',
        options: [
          { label: 'Descending', value: 'DESC' },
          { label: 'Ascending', value: 'ASC' },
        ],
        default: 'DESC',
      },
      { type: 'header', label: 'Type filters apply based on selected Sort By option' },
      ...(
        [
          ['popular_type', 'Popular Type', POPULAR_TYPES],
          ['latest_type', 'Latest Type', LATEST_TYPES],
          ['search_type', 'Search Type', SEARCH_TYPES],
        ] as const
      ).map(([id, label, options]): Filter => ({
        type: 'select',
        id,
        label,
        options: options.map(([l, v]) => ({ label: l, value: v })),
        default: '1',
      })),
      { type: 'separator' },
      {
        type: 'header',
        label:
          "Filters below ignore text search and all options above. Query must match title's non-special characters; separate queries with comma (,)",
      },
      ...TEXT_SEARCHES.map(([id, label]): Filter => ({ type: 'text', id, label })),
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const info = (label: string) =>
        document.select(`.field:has(.field-label:contains(${label}:)) .links a`).map((a) => a.text());
      const section = info('Section');
      const characters = info('Characters');
      const unlabelled = [
        'field-name-field-author',
        'field-name-field-authors-gr',
        'field-name-field-img-group',
        'field-name-field-hentai-img-group',
        'field-name-field-rule-63-section',
      ].flatMap((c) => document.select(`.${c} a`).map((a) => a.text()));
      const authors = [...new Set([...info('Author'), ...unlabelled])].join(', ');
      const description = [
        ...(section.length ? [`Section:\n${section.join(', ')}`] : []),
        ...(characters.length ? [`Characters:\n${characters.join(', ')}`] : []),
        `Pages:\n${galleryImages(document).length}`,
      ].join('\n\n');
      return {
        url: manga.url,
        title:
          document
            .select('h1#page-title')
            .map((e) => e.text())
            .join(' ') || manga.title,
        author: authors || undefined,
        artist: authors || undefined,
        genres: [...new Set([...info('Tags'), ...section, ...characters])],
        status: section.includes('Ongoings') ? 'ongoing' : 'completed',
        description,
        thumbnailUrl: manga.thumbnailUrl,
      };
    },
    getChapters: async (manga: MangaSummary): Promise<Chapter[]> => [{ url: manga.url, name: 'Chapter', number: 1 }],
    async getPages(chapter: Chapter): Promise<Page[]> {
      return galleryImages(await load(chapter.url)).map((img, index) => ({
        index,
        imageUrl: (img.absUrl('src') || img.attr('src') || '')
          .replace(/\/styles\/juicebox_[^/]+\/public/, '')
          .split('?')[0]!,
      }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase().replace(/^www\./, '') === hostOf(BASE_URL).replace(/^www\./, '')
        ? { url: match[2]!, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
