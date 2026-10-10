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
import { USER_AGENT, hostOf } from './common/utils';

const BASE_URL = 'https://rawuwu.net';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const STATUSES = [
  { label: 'All', value: '' },
  { label: 'Ongoing', value: 'ongoing' },
  { label: 'Completed', value: 'completed' },
];
const SORTS = [
  { label: 'Recently updated', value: '' },
  { label: 'Most viewed', value: 'most_viewed' },
  { label: 'Most viewed today', value: 'most_viewed_today' },
];

const get = async <T>(path: string): Promise<T> =>
  (await http.get<T>(`${BASE_URL}${path}`, { headers, responseType: 'json' })).body;

const genreName = (text: string) =>
  text
    .split(' ')
    .map((w) => w.toLowerCase().replace(/^./, (c) => c.toUpperCase()))
    .join(' ');

interface ListResponse {
  manga_list: { manga_id: number; manga_name: string; manga_cover_img: string }[];
  pagi: { button: { next: number } };
}

async function doSearch(query: string, page: number, filters: FilterState, defaultSort = 'most_viewed'): Promise<MangaPage> {
  let path: string;
  if (query) path = `/spa/search?query=${encodeURIComponent(query)}&page=${page}`;
  else {
    const status = typeof filters.status === 'string' ? filters.status : '';
    const sort = typeof filters.sort === 'string' ? filters.sort : defaultSort;
    const genre = typeof filters.genre === 'string' && filters.genre ? filters.genre : 'all';
    path = `/spa/genre/${genre}?status=${status}&sort=${sort}&page=${page}`;
  }
  const data = await get<ListResponse>(path);
  return {
    items: data.manga_list.map((m) => ({ url: `/raw/${m.manga_id}`, title: m.manga_name, thumbnailUrl: m.manga_cover_img })),
    hasNextPage: (data.pagi?.button?.next ?? 0) > 0,
  };
}

const idOf = (url: string) => /\/raw\/(\d+)/.exec(url)?.[1] ?? url;
const chapterNumber = (n: number) => String(n).replace(/\.0$/, '');

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => doSearch('', page, {}, 'most_viewed'),
    getLatest: (page) => doSearch('', page, { sort: '' }, ''),
    search: (query, page, filters) => doSearch(query, page, filters),
    async getFilters(): Promise<Filter[]> {
      const doc = html.load((await http.get(`${BASE_URL}/genre/all`, { headers })).body, { baseUrl: BASE_URL });
      const genres = doc.select('.genre-list a[id]').map((a) => ({ label: genreName(a.attr('title') ?? ''), value: a.attr('id') ?? '' }));
      return [
        { type: 'header', label: 'Filters are ignored when using text search.' },
        { type: 'select', id: 'status', label: 'Status', options: STATUSES, default: '' },
        { type: 'select', id: 'sort', label: 'Sort by', options: SORTS, default: 'most_viewed' },
        { type: 'select', id: 'genre', label: 'Genre', options: [{ label: 'All', value: 'all' }, ...genres], default: 'all' },
      ];
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const data = await get<any>(`/spa/manga/${idOf(manga.url)}`);
      const d = data.detail;
      const alt = String(d.manga_others_name ?? '')
        .split(',')
        .map((n) => `\n - ${n.trim()}`)
        .join('');
      return {
        url: manga.url,
        title: d.manga_name,
        thumbnailUrl: d.manga_cover_img,
        description: `${d.manga_description ? `${d.manga_description}\n\n` : ''}Alternative Names: ${alt}`,
        author: data.authors.map((a: { author_name: string }) => a.author_name).join(', ') || undefined,
        genres: data.tags.map((t: { tag_name: string }) => genreName(t.tag_name)),
        status: d.manga_status ? 'completed' : 'ongoing',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const data = await get<any>(`/spa/manga/${idOf(manga.url)}`);
      return data.chapters.map(
        (c: { chapter_number: number; chapter_title?: string | null; chapter_date_published?: string }): Chapter => {
          const n = chapterNumber(c.chapter_number);
          const time = c.chapter_date_published ? Date.parse(c.chapter_date_published) : Number.NaN;
          return {
            url: `/read/${data.detail.manga_id}/chapter-${n}`,
            name: c.chapter_title ? `Ch. ${n} - ${c.chapter_title}` : `Chapter ${n}`,
            number: c.chapter_number,
            uploadedAt: Number.isNaN(time) ? undefined : time,
          };
        },
      );
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [, , mangaId, chapterPart] = chapter.url.split('/');
      const data = await get<{ chapter_detail: { chapter_content: string; server: string } }>(
        `/spa/manga/${mangaId}/${(chapterPart ?? '').replace(/^chapter-/, '')}`,
      );
      const doc = html.load(data.chapter_detail.chapter_content, { baseUrl: data.chapter_detail.server });
      return doc.select('img').map((img, index) => ({ index, imageUrl: img.absUrl('data-src') }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /\/(?:raw|read)\/([^/?#]+)/.exec(url);
      return hostOf(url) === hostOf(BASE_URL) && match ? { url: `/raw/${match[1]}`, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
