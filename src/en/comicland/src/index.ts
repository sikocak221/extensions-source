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
import { USER_AGENT, hostOf, withQuery } from './common/utils';

const BASE_URL = 'https://comicland.org';
const API = 'https://api.comicland.org/api';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface Comic {
  slug: string;
  title: string;
  cover_url: string;
}

const api = async <T>(url: string) =>
  (await http.get<{ data?: T | null }>(url, { headers, responseType: 'json' })).body.data;

async function list(url: string): Promise<MangaPage> {
  const data = await api<{ list?: Comic[]; items?: Comic[]; has_more?: boolean }>(url);
  const comics = data?.list ?? data?.items ?? [];
  return {
    items: comics.map((c) => ({ url: `/comic/${c.slug}`, title: c.title, thumbnailUrl: c.cover_url })),
    hasNextPage: data?.has_more ?? comics.length === 20,
  };
}

const page = (n: number) => ({ offset: String((n - 1) * 20), limit: '20' });
const slugOf = (url: string) => url.split('/')[2] ?? '';

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (n) => list(withQuery(`${API}/comics/popular`, page(n))),
    getLatest: (n) => list(withQuery(`${API}/comics`, { ...page(n), status: 'ongoing' })),
    search(query: string, n: number, filters: FilterState) {
      if (query.trim()) return list(withQuery(`${API}/comic/search`, { q: query.trim(), ...page(n) }));
      const category = typeof filters.category === 'string' && filters.category ? filters.category : 'popular';
      const endpoint =
        category === 'official' ? '/comics/official' : category === 'popular' ? '/comics/popular' : '/comics';
      return list(
        withQuery(`${API}${endpoint}`, { ...page(n), status: category === 'ongoing' ? 'ongoing' : undefined }),
      );
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'Text search ignores Category filter' },
      {
        type: 'select',
        id: 'category',
        label: 'Category',
        options: ['Recommended', 'Official', 'Ongoing', 'Popular'].map((l) => ({ label: l, value: l.toLowerCase() })),
        default: 'popular',
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const d = await api<
        Comic & {
          description?: string;
          authors?: { name: string }[];
          artists?: { name: string }[];
          genres?: { name: string }[];
        }
      >(`${API}/comic/detail?slug=${slugOf(manga.url)}`);
      if (!d) throw new Error('Failed to parse manga details');
      return {
        url: manga.url,
        title: d.title,
        thumbnailUrl: d.cover_url,
        description: d.description || undefined,
        author: d.authors?.map((a) => a.name).join(', ') || undefined,
        artist: d.artists?.map((a) => a.name).join(', ') || undefined,
        genres: d.genres?.map((g) => g.name),
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const d = await api<{ slug: string; chapters?: { chapter_index: number; title: string }[] }>(
        `${API}/comic/detail?slug=${slugOf(manga.url)}`,
      );
      if (!d) throw new Error('Failed to parse manga details');
      return (d.chapters ?? [])
        .map((c) => ({
          url: `/comic/${d.slug}/chapter/${String(c.chapter_index).replace(/\.0$/, '')}`,
          name: c.title,
          number: c.chapter_index,
        }))
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [, , slug, , index] = chapter.url.split('/');
      const data = await api<{ pages?: string[] }>(`${API}/chapter/pages_by_index?slug=${slug}&index=${index}`);
      return (data?.pages ?? []).map((imageUrl, i) => ({ index: i, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/comic\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/comic/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
