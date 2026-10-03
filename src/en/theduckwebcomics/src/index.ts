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

const BASE_URL = 'https://www.theduckwebcomics.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
// [param, label, [label, value][]] checkbox groups of the search form.
const GROUPS: [string, string, [string, string][]][] = [
  [
    'type',
    'Type of comic',
    [
      ['Comic Strip', '0'],
      ['Comic Book/Story', '1'],
    ],
  ],
  [
    'tone',
    'Tone',
    [
      ['Comedy', '0'],
      ['Drama', '1'],
      ['Other', '3'],
    ],
  ],
  [
    'style',
    'Art style',
    ['Cartoon', 'American', 'Manga', 'Realism', 'Sprite', 'Sketch', 'Experimental', 'Photographic', 'Stick Figure'].map(
      (l, i) => [l, String(i)],
    ),
  ],
  [
    'genre',
    'Genre',
    [
      ['Fantasy', '0'],
      ['Parody', '1'],
      ['Real Life', '2'],
      ['Sci-Fi', '4'],
      ['Horror', '5'],
      ['Abstract', '6'],
      ['Adventure', '8'],
      ['Noir', '9'],
      ['Political', '12'],
      ['Spiritual', '13'],
      ['Romance', '14'],
      ['Superhero', '15'],
      ['Western', '16'],
      ['Mystery', '17'],
      ['War', '18'],
      ['Tribute', '19'],
    ],
  ],
  [
    'rating',
    'Rating',
    [
      ['Everyone', 'E'],
      ['Teen', 'T'],
      ['Mature', 'M'],
      ['Adult', 'A'],
    ],
  ],
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

async function list(url: string): Promise<MangaPage> {
  const document = await load(url);
  const items = document.select('.breadcrumb ~ div[style]').flatMap((row): MangaSummary[] => {
    const title = row.selectFirst('.size24');
    if (!title) return [];
    return [
      {
        url: relativeUrl(title.absUrl('href') || title.attr('href') || ''),
        title: title.text(),
        thumbnailUrl: row.selectFirst('img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('a.next') != null };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`/search/?page=${page}`),
    getLatest: (page) => list(`/search/?page=${page}&last_update=today`),
    search(query: string, page: number, filters: FilterState) {
      const params = [`search=${encodeURIComponent(query.trim())}`, `page=${page}`];
      for (const [id, value] of Object.entries(filters)) {
        const [param, v] = id.split('.');
        if (v !== undefined && value === true) params.push(`${param}=${encodeURIComponent(v)}`);
      }
      if (typeof filters.last_update === 'string' && filters.last_update)
        params.push(`last_update=${filters.last_update}`);
      return list(`/search?${params.join('&')}`);
    },
    getFilters: (): Filter[] => [
      ...GROUPS.map(([param, label, values]): Filter => ({
        type: 'group',
        id: param,
        label,
        filters: values.map(([l, v]) => ({ type: 'checkbox', id: `${param}.${v}`, label: l })),
      })),
      {
        type: 'select',
        id: 'last_update',
        label: 'Last update',
        options: [
          ['Any', ''],
          ['Today', 'today'],
          ['Last week', 'week'],
          ['Last month', 'month'],
        ].map(([label, value]) => ({ label: label!, value: value! })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      return {
        url: manga.url,
        title: manga.title || document.selectFirst('h1, h2')?.text() || '',
        thumbnailUrl: manga.thumbnailUrl,
        description: document.selectFirst('meta[name=description]')?.attr('content') || undefined,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      const notice = document.selectFirst('.yellow-box > .paranomargin')?.text();
      if (notice) throw new Error(notice);
      return document.select('#page_dropdown > option').map((option, i) => ({
        url: `${relativeUrl(option.absUrl('value') || option.attr('value') || '')}/`.replace(/\/\/$/, '/'),
        name: option.text().split('- ').slice(1).join('- ') || option.text(),
        number: i + 1,
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const img = (await load(chapter.url)).selectFirst('.page-image');
      const src = img?.absUrl('src') || img?.attr('src');
      if (!src) throw new Error('Page image not found');
      return [{ index: 0, imageUrl: src }];
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[^/?#]+\/)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
