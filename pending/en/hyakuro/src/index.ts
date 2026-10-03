import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, parseDate } from './common/utils';

const BASE_URL = 'https://hyakuro.net';
const API = `${BASE_URL}/backend/api`;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const CATEGORIES: string[] = [
  'Action',
  'Adult',
  'Adventure',
  'Comedy',
  'Doujinshi',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Gender Bender',
  'Harem',
  'Hentai',
  'Historical',
  'Horror',
  'Josei',
  'Lolicon',
  'Martial Arts',
  'Mature',
  'Mecha',
  'Mystery',
  'Psychological',
  'Romance',
  'School Life',
  'Sci-fi',
  'Seinen',
  'Shotacon',
  'Shoujo',
  'Shoujo Ai',
  'Shounen',
  'Shounen Ai',
  'Slice of Life',
  'Smut',
  'Sports',
  'Supernatural',
  'Tragedy',
  'Webtoon',
  'Yaoi',
  'Yuri',
];

interface Attributes {
  Title: string;
  slug: string;
  Synopsis?: string | null;
  Artist?: string | null;
  Author?: string | null;
  Status?: string | null;
  Cover?: { data?: { attributes?: { url: string } } | null } | null;
  Chapters?:
    | {
        id: number;
        Chapter: number;
        Title?: string | null;
        TranslatedOn?: string | null;
        Pages?: { data: { attributes: { url: string } }[] } | null;
      }[]
    | null;
  Categories?: string[] | null;
  Longstrip?: boolean | null;
  Oneshot?: boolean | null;
  publishedAt?: string | null;
}

// Strapi API: "mangas" with Cover and Chapters populated. Manga urls are "/manga/<slug>", chapter urls
// "/manga/<slug>/read/<number>/1#<chapter id>".
async function mangas(
  params: string,
): Promise<{ data: { attributes: Attributes }[]; meta: { pagination: { page: number; pageCount: number } } }> {
  return (await http.get(`${API}/mangas?${params}`, { headers, responseType: 'json' })).body as never;
}

const cover = (a: Attributes) =>
  a.Cover?.data?.attributes?.url ? `${BASE_URL}/backend${a.Cover.data.attributes.url}` : undefined;
const num = (n: number) => (Number.isInteger(n) ? String(n) : String(n));

async function list(params: string): Promise<MangaPage> {
  const data = await mangas(params);
  return {
    items: data.data.map(({ attributes: a }) => ({ url: `/manga/${a.slug}`, title: a.Title, thumbnailUrl: cover(a) })),
    hasNextPage: data.meta.pagination.page < data.meta.pagination.pageCount,
  };
}

async function bySlug(url: string, populate = 'populate=Cover,Chapters'): Promise<Attributes> {
  const slug = url.split('/')[2] ?? '';
  const found = (await mangas(`filters[slug][$eq]=${encodeURIComponent(slug)}&${populate}`)).data[0]?.attributes;
  if (!found) throw new Error('Manga not found');
  return found;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`populate=Cover,Chapters&sort=Title:asc&pagination[page]=${page}`),
    getLatest: (page) => list(`populate=Cover,Chapters&sort=updatedAt:desc&pagination[page]=${page}`),
    search(query: string, page: number, filters: FilterState) {
      const params = [`pagination[page]=${page}`, 'populate=Cover,Chapters', 'sort=updatedAt:desc'];
      if (query.trim()) params.push(`filters[Title][$containsi]=${encodeURIComponent(query.trim())}`);
      const status = typeof filters.status === 'string' ? filters.status : '';
      if (status === 'Oneshot') params.push('filters[Oneshot][$eq]=true');
      else if (status) params.push(`filters[Status][$eq]=${status}`);
      Object.entries(filters)
        .filter(([id, v]) => id.startsWith('category.') && v === true)
        .forEach(([id], i) =>
          params.push(`filters[$and][${i + 1}][Categories][$containsi]=${encodeURIComponent(id.slice(9))}`),
        );
      return list(params.join('&'));
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'NOTE: Search query will be applied to filters' },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: ['All', 'Ongoing', 'Completed', 'Dropped', 'Oneshot'].map((s, i) => ({ label: s, value: i ? s : '' })),
      },
      {
        type: 'group',
        id: 'category',
        label: 'Categories',
        filters: CATEGORIES.map((c) => ({ type: 'checkbox', id: `category.${c}`, label: c })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const a = await bySlug(manga.url);
      const statuses: Record<string, MangaStatus> = {
        Ongoing: 'ongoing',
        Completed: 'completed',
        Dropped: 'cancelled',
      };
      return {
        url: manga.url,
        title: a.Title,
        thumbnailUrl: cover(a) ?? manga.thumbnailUrl,
        author: a.Author || undefined,
        artist: a.Artist || undefined,
        description: a.Synopsis || undefined,
        status: statuses[a.Status ?? ''] ?? 'unknown',
        genres: [...(a.Categories ?? []), ...(a.Longstrip ? ['Longstrip'] : []), ...(a.Oneshot ? ['Oneshot'] : [])],
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const a = await bySlug(manga.url);
      return [...(a.Chapters ?? [])]
        .sort((x, y) => y.Chapter - x.Chapter)
        .map((c) => {
          const label = a.Oneshot ? 'Oneshot' : `Chapter ${num(c.Chapter)}`;
          const date = c.TranslatedOn ?? a.publishedAt ?? undefined;
          return {
            url: `/manga/${a.slug}/read/${num(c.Chapter)}/1#${c.id}`,
            name: c.Title ? `${label} - ${c.Title}` : label,
            number: c.Chapter,
            uploadedAt: date?.includes('T') ? Date.parse(date) || undefined : parseDate(date, 'yyyy-MM-dd'),
          };
        });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const a = await bySlug(chapter.url, 'populate[Chapters][populate]=*');
      const id = Number(chapter.url.split('#')[1]);
      const pages = a.Chapters?.find((c) => c.id === id)?.Pages?.data ?? [];
      return pages
        .map((p) => p.attributes.url)
        .sort()
        .map((url, index) => ({ index, imageUrl: `${BASE_URL}/backend${url}` }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/manga\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/manga/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => `${BASE_URL}${item.url.split('#')[0]}`,
  }),
});
