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

const BASE_URL = 'https://rawdevart.art';
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

interface ListResponse {
  manga_list: { manga_id: number; manga_name: string; manga_cover_img: string }[];
  pagi: { button?: { prev: number; next: number } | null };
}

async function list(path: string): Promise<MangaPage> {
  const data = await get<ListResponse>(path);
  return {
    items: data.manga_list.map((m) => ({
      url: `/g/ne${m.manga_id}`,
      title: m.manga_name,
      thumbnailUrl: m.manga_cover_img,
    })),
    hasNextPage: (data.pagi.button?.next ?? 0) !== 0,
  };
}

const idOf = (url: string) => /ne(\d+)/.exec(url)?.[1] ?? url;
const chapterNumber = (n: number) => String(n).replace(/\.0$/, '');

async function doSearch(query: string, page: number, filters: FilterState): Promise<MangaPage> {
  if (query) return list(`/spa/search?page=${page}&query=${encodeURIComponent(query)}`);
  const genre = typeof filters.genre === 'string' && filters.genre ? filters.genre : 'all';
  const params = [`page=${page}`];
  const status = typeof filters.status === 'string' ? filters.status : '';
  const sort = typeof filters.sort === 'string' ? filters.sort : 'most_viewed';
  params.push(`status=${status}`, `sort=${sort}`);
  return list(`/spa/genre/${genre}?${params.join('&')}`);
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => doSearch('', page, {}),
    getLatest: (page) => list(`/spa/latest-manga?page=${page}`),
    search: doSearch,
    async getFilters(): Promise<Filter[]> {
      const doc = html.load((await http.get(`${BASE_URL}/genre/all`, { headers })).body, { baseUrl: BASE_URL });
      const genres = doc.select('.genre-list a[id]').map((a) => ({
        label: (a.attr('title') ?? a.text())
          .split(' ')
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join(' '),
        value: a.attr('id') ?? '',
      }));
      return [
        { type: 'header', label: 'Filters are ignored when using text search.' },
        { type: 'select', id: 'status', label: 'Status', options: STATUSES, default: '' },
        { type: 'select', id: 'sort', label: 'Sort by', options: SORTS, default: 'most_viewed' },
        {
          type: 'select',
          id: 'genre',
          label: 'Genre',
          options: [{ label: 'All', value: 'all' }, ...genres],
          default: 'all',
        },
      ];
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const data = await get<any>(`/spa/manga/${idOf(manga.url)}`);
      const d = data.detail;
      const parts: string[] = [];
      if (d.manga_views > 0) parts.push(`**Views:** ${d.manga_views}`);
      if (d.manga_description?.trim()) parts.push(`**Summary:**\n${d.manga_description}`);
      if (d.manga_others_name?.trim()) parts.push(`**Alternative Titles:**\n${d.manga_others_name}`);
      return {
        url: manga.url,
        title: d.manga_name,
        thumbnailUrl: d.manga_cover_img_full ?? d.manga_cover_img,
        author: data.authors.map((a: { author_name: string }) => a.author_name).join(', ') || undefined,
        description: parts.join('\n\n'),
        genres: data.tags.map((t: { tag_name: string }) => t.tag_name),
        status: d.manga_status ? 'completed' : 'ongoing',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const data = await get<any>(`/spa/manga/${idOf(manga.url)}`);
      return data.chapters.map(
        (c: { chapter_title: string; chapter_number: number; chapter_date_published: string }): Chapter => {
          const time = Date.parse(c.chapter_date_published);
          const n = chapterNumber(c.chapter_number);
          return {
            url: `spa/manga/${data.detail.manga_id}/${n}`,
            name: `Chapter ${n}${c.chapter_title ? `: ${c.chapter_title}` : ''}`,
            number: c.chapter_number,
            uploadedAt: Number.isNaN(time) ? undefined : time,
          };
        },
      );
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const data = await get<{ chapter_detail: { chapter_content?: string; server: string } }>(`/${chapter.url}`);
      const doc = html.load(data.chapter_detail.chapter_content ?? '', { baseUrl: data.chapter_detail.server });
      return doc.select('img[data-src]').map((img, index) => ({ index, imageUrl: img.absUrl('data-src') }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const id = /\/g\/ne(\d+)/.exec(url)?.[1];
      return hostOf(url) === hostOf(BASE_URL) && id ? { url: `/g/ne${id}`, title: '' } : null;
    },
    getWebUrl(item): string {
      if ('name' in item) {
        const [, , id, n] = item.url.split('/');
        return `${BASE_URL}/read/ne${id}/chapter-${n}`;
      }
      return BASE_URL + item.url;
    },
  }),
});
