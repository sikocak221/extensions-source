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
import { USER_AGENT, withQuery } from './common/utils';

const BASE_URL = 'https://manhwa18.net';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface MangaDto {
  name: string;
  slug: string;
  cover_url?: string | null;
  thumb_url?: string | null;
  pilot?: string | null;
  description?: string | null;
  genres?: { name: string }[];
  artists?: { name: string }[];
  status_id?: number | null;
}
interface Paginate {
  data: MangaDto[];
  next_page_url?: string | null;
}
interface Props {
  paginate?: Paginate;
  popularManga?: Paginate;
  mangas?: Paginate;
  latestManhwaMain?: Paginate;
  manga?: MangaDto;
  chapters?: { name: string; slug: string; created_at?: string | null }[];
  chapterContent?: string;
}

async function pageProps(url: string): Promise<Props> {
  const response = await http.get(url, { headers });
  const app = html.load(response.body, { baseUrl: response.url }).selectFirst('#app');
  if (!app) throw new Error('Could not find #app element');
  const data = app.attr('data-page');
  if (!data) throw new Error('data-page attribute is empty');
  return (JSON.parse(data) as { props: Props }).props;
}

function fixImageUrl(url: string | null | undefined): string | undefined {
  if (!url?.trim()) return undefined;
  if (url.startsWith('http')) return url;
  return url.startsWith('/') ? BASE_URL + url : `${BASE_URL}/${url}`;
}

/** Plain text of an html fragment. */
const htmlText = (fragment: string) => html.load(`<div>${fragment}</div>`).text();

async function parseList(url: string): Promise<MangaPage> {
  const props = await pageProps(url);
  const listing = props.paginate ?? props.popularManga ?? props.mangas ?? props.latestManhwaMain;
  if (!listing) throw new Error('No manga listing found in response');
  return {
    items: listing.data.map((m) => ({
      url: `/manga/${m.slug}`,
      title: m.name,
      thumbnailUrl: fixImageUrl(m.cover_url ?? m.thumb_url),
    })),
    hasNextPage: listing.next_page_url != null,
  };
}

const STATUSES: [string, string][] = [
  ['Ongoing', 'Ongoing'],
  ['On Hold', 'Onhold'],
  ['Completed', 'completed'],
];

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    getPopular: (page: number) => parseList(`${BASE_URL}/manga-list?sort=top&page=${page}`),

    getLatest: (page: number) => parseList(`${BASE_URL}/manga-list?sort=update&page=${page}`),

    getFilters(): Filter[] {
      return [
        { type: 'header', label: 'Filters work with both search and browse' },
        { type: 'separator' },
        {
          type: 'select',
          id: 'sort',
          label: 'Sort By',
          options: [
            { label: 'Latest Updates', value: 'update' },
            { label: 'Most Viewed', value: 'top' },
            { label: 'Most Liked', value: 'like' },
            { label: 'Newest', value: 'new' },
          ],
        },
        {
          type: 'group',
          id: 'status',
          label: 'Status',
          filters: STATUSES.map(([label, value]): Filter => ({ type: 'checkbox', id: `status:${value}`, label })),
        },
      ];
    },

    search(query: string, page: number, state: FilterState): Promise<MangaPage> {
      const params: Record<string, string> = { page: String(page) };
      if (query) params.q = query;
      if (typeof state.sort === 'string') params.sort = state.sort;
      for (const [, value] of STATUSES) if (state[`status:${value}`] === true) params[value] = '1';
      return parseList(withQuery(`${BASE_URL}${query ? '/tim-kiem' : '/manga-list'}`, params));
    },

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const props = await pageProps(`${BASE_URL}${manga.url}`);
      const m = props.manga;
      if (!m) throw new Error('Manga details not found');
      const artists = (m.artists ?? []).map((a) => a.name).join(', ');
      const text = m.pilot ?? m.description;
      return {
        url: manga.url,
        title: m.name,
        description: text ? htmlText(text) : undefined,
        thumbnailUrl: fixImageUrl(m.cover_url ?? m.thumb_url) ?? manga.thumbnailUrl,
        genres: (m.genres ?? []).map((g) => g.name),
        author: artists || undefined,
        artist: artists || undefined,
        status: m.status_id === 0 ? 'ongoing' : m.status_id === 1 || m.status_id === 2 ? 'completed' : 'unknown',
      };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const props = await pageProps(`${BASE_URL}${manga.url}`);
      if (!props.chapters) throw new Error('Chapters not found');
      const slug = props.manga?.slug ?? manga.url.split('/').pop();
      return props.chapters.map((c) => ({
        url: `/manga/${slug}/${c.slug}`,
        name: c.name,
        uploadedAt: Date.parse(c.created_at ?? '') || undefined,
      }));
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const props = await pageProps(`${BASE_URL}${chapter.url}`);
      if (!props.chapterContent) throw new Error('Chapter content not found');
      const images: HtmlElement[] = html.load(props.chapterContent).select('img');
      const urls = images
        .map((img) => fixImageUrl(img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src')))
        .filter((u): u is string => !!u);
      return urls.map((imageUrl, index) => ({ index, imageUrl }));
    },

    imageHeaders: () => headers,

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?manhwa18\.net(\/manga\/[^/?#]+)/i.exec(url.trim());
      return match ? { url: match[1]!, title: '' } : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
