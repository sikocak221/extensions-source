import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, relativeDate, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://9hentai.so';
const IMAGES = 'https://i.9hentai.so/images';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
// Text filters naming tags, with the site's tag type.
const TAG_FILTERS: [string, string, number][] = [
  ['included', 'Included Tags', 1],
  ['excluded', 'Excluded Tags', 1],
  ['artist', 'Artist', 4],
  ['group', 'Group', 2],
  ['parody', 'Parody', 3],
  ['character', 'Character', 5],
  ['category', 'Category', 6],
];

interface Book {
  id: number;
  total_page: number;
  title: string;
}

const post = async <T>(path: string, body: unknown) =>
  (await http.post<T>(`${BASE_URL}${path}`, { json: body }, { headers, responseType: 'json' })).body;
const cover = (id: number) => `${IMAGES}/${id}/cover.jpg`;
const toSummary = (b: Book): MangaSummary => ({ url: `/g/${b.id}`, title: b.title, thumbnailUrl: cover(b.id) });
const byId = async (id: number) => (await post<{ results: Book }>('/api/getBookByID', { id })).results;

async function tags(text: string, type: number): Promise<{ id: number; name: string; type: number }[]> {
  const found: { id: number; name: string; type: number }[] = [];
  for (const name of text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)) {
    const tag = (
      await post<{ results: { id: number; name: string; type?: number }[] }>('/api/getTag', {
        tag_name: name,
        tag_type: type,
      })
    ).results[0];
    if (tag) found.push({ id: tag.id, name: tag.name, type: tag.type ?? 1 });
  }
  return found;
}

async function search(
  page: number,
  text = '',
  sort = 0,
  range = [0, 2000],
  included: unknown[] = [],
  excluded: unknown[] = [],
): Promise<MangaPage> {
  const data = await post<{ total_count: number; results: Book[] }>('/api/getBook', {
    search: { text, page: page - 1, sort, pages: { range }, tag: { items: { included, excluded } } },
  });
  return { items: data.results.map(toSummary), hasNextPage: data.total_count > page };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => search(page, '', 1),
    getLatest: (page) => search(page),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const q = query.trim();
      if (q.startsWith('id:')) {
        const id = Number(q.slice(3));
        return { items: Number.isInteger(id) && id > 0 ? [toSummary(await byId(id))] : [], hasNextPage: false };
      }
      const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string).trim() : '');
      const included: unknown[] = [];
      const excluded: unknown[] = [];
      for (const [id, , type] of TAG_FILTERS)
        if (text(id)) (id === 'excluded' ? excluded : included).push(...(await tags(text(id), type)));
      return search(
        page,
        q,
        Number(text('sort') || 0),
        [Number(text('minPages')) || 0, Number(text('maxPages')) || 2000],
        included,
        excluded,
      );
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'Search by id with "id:" in front of query' },
      { type: 'separator' },
      {
        type: 'select',
        id: 'sort',
        label: 'Sort',
        options: ['Newest', 'Popular Right now', 'Most Fapped', 'Most Viewed', 'By Title'].map((l, i) => ({
          label: l,
          value: String(i),
        })),
      },
      { type: 'text', id: 'minPages', label: 'Minimum Pages' },
      { type: 'text', id: 'maxPages', label: 'Maximum Pages' },
      ...TAG_FILTERS.map(([id, label]): Filter => ({ type: 'text', id, label })),
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = html.load((await http.get(absoluteUrl(BASE_URL, manga.url), { headers })).body);
      const info = document.selectFirst('div#bigcontainer');
      const field = (label: string) =>
        info ? selectIgnoreCase(info, `div.field-name:contains(${label}) a.tag`).map((a) => a.text()) : [];
      const lines = [
        info
          ?.select('h2')
          .map((h) => h.text())
          .join(', ')
          ? `Alternative Title: ${info
              .select('h2')
              .map((h) => h.text())
              .join(', ')}`
          : '',
        field('Parody:').length ? `Parody: ${field('Parody:').join(', ')}` : '',
        field('Category:').length ? `Category: ${field('Category:').join(', ')}` : '',
        field('Language:').length ? `Language: ${field('Language:').join(', ')}` : '',
      ].filter(Boolean);
      return {
        url: manga.url,
        title:
          info
            ?.select('h1')
            .map((h) => h.text())
            .join(' ') || manga.title,
        thumbnailUrl: cover(Number(manga.url.split('/')[2])),
        artist: field('Artist:').join(', ') || undefined,
        author: field('Group:').join(', ') || 'Unknown circle',
        genres: field('Tag:'),
        description: lines.join('\n\n') || undefined,
        status: 'completed',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = html.load((await http.get(absoluteUrl(BASE_URL, manga.url), { headers })).body);
      return [
        {
          url: manga.url,
          name: 'Chapter',
          uploadedAt: relativeDate(
            document
              .select('div#info div time')
              .map((t) => t.text())
              .join(' '),
          ),
        },
      ];
    },
    // The last page is sometimes missing: its preview answers 404.
    async getPages(chapter: Chapter): Promise<Page[]> {
      const id = Number(chapter.url.split('/')[2]);
      let total = (await byId(id)).total_page;
      const preview = await http.request({ url: `${IMAGES}/${id}/preview/${total}t.jpg`, method: 'HEAD', headers });
      if (preview.status === 404) total--;
      return Array.from({ length: total }, (_, i) => ({ index: i, imageUrl: `${IMAGES}/${id}/${i + 1}.jpg` }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/g\/(\d+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/g/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
