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

const BASE_URL = 'https://manga-meets.jp';
const API = `${BASE_URL}/api`;
const PAGE_SIZE = 20;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const SORTS = [
  { label: 'All', value: '' },
  { label: '新着順', value: 'last_episode_published_at' },
  { label: '閲覧数順', value: 'total_view_count' },
  { label: 'スキ！数順', value: 'loves_count' },
  { label: '担当希望数順', value: 'editor_requests_count' },
];

interface Included {
  id: string;
  type: string;
  attributes: { dir_name?: string | null; title?: string | null; url?: string | null; name?: string | null };
  relationships?: { comic?: { data?: { id: string } | null }; thumbnail_image?: { data?: { id: string } | null } };
}
interface Rel {
  data: { id: string }[];
}

const dirOf = (url: string) => url.replace(/^\/comics\//, '');
const get = async <T>(url: string): Promise<T> => (await http.get<T>(url, { headers, responseType: 'json' })).body;

async function list(url: string): Promise<MangaPage> {
  const result = await get<{
    data: {
      attributes: { total_page: number; current_page: number };
      relationships: { comics?: Rel; episodes?: Rel };
    };
    included: Included[];
  }>(url);
  const byId = new Map(result.included.map((i) => [i.id, i]));
  const refs = (result.data.relationships.comics ?? result.data.relationships.episodes)?.data ?? [];
  const seen = new Set<string>();
  const items: MangaSummary[] = [];
  for (const ref of refs) {
    const item = byId.get(ref.id);
    if (!item) continue;
    const comicRef = item.relationships?.comic?.data;
    const comic = (comicRef && byId.get(comicRef.id)) || item;
    const thumbRef = item.relationships?.thumbnail_image?.data;
    const thumb = thumbRef ? byId.get(thumbRef.id) : undefined;
    const dir = comic.attributes.dir_name;
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    items.push({ url: `/comics/${dir}`, title: comic.attributes.title ?? '', thumbnailUrl: thumb?.attributes.url ?? undefined });
  }
  return { items, hasNextPage: result.data.attributes.current_page < result.data.attributes.total_page };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`${API}/comics/search.json?sort=weekly_view_count&page=${page}&size=${PAGE_SIZE}`),
    getLatest: (page) => list(`${API}/episodes/latest.json?page=${page}&size=${PAGE_SIZE}`),
    async getFilters(): Promise<Filter[]> {
      const names = async (path: string, prefix: string) =>
        (await get<{ data: { attributes: { name: string } }[] }>(`${API}/${path}`).catch(() => ({ data: [] }))).data.map(
          (d) => ({ label: d.attributes.name, value: `${prefix}:${d.attributes.name}` }),
        );
      const [tags, genres] = await Promise.all([names('official_tags.json', 'tag'), names('comic_genres.json', 'genre')]);
      const filters: Filter[] = [{ type: 'select', id: 'sort', label: 'Sort By', options: SORTS, default: '' }];
      if (tags.length || genres.length)
        filters.push({
          type: 'select',
          id: 'tag',
          label: 'Tags / Genres',
          options: [{ label: 'All', value: '' }, ...tags, ...genres],
          default: '',
        });
      return filters;
    },
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params = [`size=${PAGE_SIZE}`, `page=${page}`];
      if (query.trim()) params.unshift(`keywords=${encodeURIComponent(query)}`);
      if (typeof filters.sort === 'string' && filters.sort) params.push(`sort=${filters.sort}`);
      if (typeof filters.tag === 'string' && filters.tag) {
        const [param, ...name] = filters.tag.split(':');
        params.push(`${param}=${encodeURIComponent(name.join(':'))}`);
      }
      return list(`${API}/comics/search.json?${params.join('&')}`);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const r = await get<{
        data: {
          attributes: { title: string; authors?: string[] | null; outline?: string | null; finished?: boolean | null };
          relationships: { comic_genre?: { data?: { id: string } | null }; thumbnail_image?: { data?: { id: string } | null } };
        };
        included: Included[];
      }>(`${API}/comics/${dirOf(manga.url)}.json`);
      const genre = r.included.find((i) => i.type === 'comic_genre' && i.id === r.data.relationships.comic_genre?.data?.id);
      const image = r.included.find((i) => i.type === 'image' && i.id === r.data.relationships.thumbnail_image?.data?.id);
      const authors = r.data.attributes.authors?.join(', ');
      return {
        url: manga.url,
        title: r.data.attributes.title,
        author: authors,
        artist: authors,
        description: r.data.attributes.outline ?? undefined,
        genres: genre?.attributes.name ? [genre.attributes.name] : undefined,
        status: r.data.attributes.finished ? 'completed' : 'ongoing',
        thumbnailUrl: image?.attributes.url ?? manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const r = await get<{
        data: {
          attributes: { key: string; title?: string | null; volume: string; sort_volume: number; published_at?: string | null };
        }[];
      }>(`${API}/comics/${dirOf(manga.url)}/episodes.json`);
      return r.data
        .map(({ attributes: a }) => {
          const time = a.published_at ? Date.parse(a.published_at) : Number.NaN;
          return {
            url: `${dirOf(manga.url)}/${a.sort_volume}`,
            name: `Chapter ${a.volume}${a.title ? ` - ${a.title}` : ''}`,
            number: a.sort_volume,
            uploadedAt: Number.isNaN(time) ? undefined : time,
          };
        })
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const r = await get<{ episode_pages: { order_index: number; image: { original_url: string } }[] }>(
        `${API}/comics/${chapter.url.split('/')[0]}/episodes/${chapter.url.split('/')[1]}/viewer.json`,
      );
      return [...r.episode_pages].sort((a, b) => a.order_index - b.order_index).map((p, index) => ({ index, imageUrl: p.image.original_url }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const dir = /\/comics\/([^/?#]+)/.exec(url)?.[1];
      return hostOf(url) === hostOf(BASE_URL) && dir ? { url: `/comics/${dir}`, title: '' } : null;
    },
    getWebUrl: (item) => ('name' in item ? `${BASE_URL}/comics/${item.url}` : BASE_URL + item.url),
  }),
});
