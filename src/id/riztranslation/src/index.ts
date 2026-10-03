import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type SortValue,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, withQuery } from './common/utils';

const BASE_URL = 'https://riztranslation.pages.dev';
const API_URL = 'https://uefnaojxivvxeamljskn.supabase.co/rest/v1';
// Public (anon) Supabase key from the website.
const API_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlZm5hb2p4aXZ2eGVhbWxqc2tuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3MTU5MjksImV4cCI6MjA2MzI5MTkyOX0._lEBN5puTvATwtYodg4zbcoTwg0ss3j2BebD8WoHt9A';
const NOT_NOVEL = 'not.ilike.*novel*';

// Manga urls are "/detail/<book id>", chapter urls "/view/<book id>/<chapter id>", like the site's pages.

interface BookDto {
  id: number;
  judul: string;
  cover?: string | null;
  status?: string | null;
  author?: string | null;
  artist?: string | null;
  synopsis?: string | null;
  genres?: { genre?: { nama?: string | null } | null }[] | null;
}

interface ChapterDto {
  id: number;
  bookId: number;
  chapter?: number | null;
  nama?: string | null;
  created_at?: string | null;
  isigambar?: string | null;
}

const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, apikey: API_KEY, Accept: 'application/json' };

async function api<T>(url: string): Promise<T> {
  return (await http.get<T>(url, { headers, responseType: 'json' })).body;
}

const toSummary = (b: BookDto): MangaSummary => ({
  url: `/detail/${b.id}`,
  title: b.judul,
  thumbnailUrl: b.cover || undefined,
});
const lastSegment = (url: string) => url.replace(/\/+$/, '').split('/').pop() ?? '';

function parseStatus(status: string | null | undefined): MangaStatus {
  const value = status?.toLowerCase();
  if (value === 'completed' || value === 'complete' || value === 'oneshot') return 'completed';
  if (value === 'ongoing') return 'ongoing';
  return 'unknown';
}

const option = (label: string, value: string) => ({ label, value });
const GENRES: [string, string][] = [
  ['Action', '10'], ['Adventure', '11'], ['Comedy', '12'], ['Drama', '1'], ['Fantasy', '9'], ['Isekai', '3'],
  ['Lucid Dream', '13'], ['Mysteri', '4'], ['Romance', '2'], ['School Life', '8'], ['Sci-Fi', '14'],
  ['Slice of Life', '6'], ['Supernatural', '24'], ['Time Travel', '19'], ['Tragedy', '5'],
]; // prettier-ignore

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    async getPopular(page: number): Promise<MangaPage> {
      const books = await api<BookDto[]>(
        `${API_URL}/Book?select=id,judul,cover&type=${NOT_NOVEL}&order=id.desc&offset=${(page - 1) * 20}&limit=20`,
      );
      return { items: books.map(toSummary), hasNextPage: books.length === 20 };
    },

    async getLatest(page: number): Promise<MangaPage> {
      const chapters = await api<{ Book?: BookDto | null }[]>(
        `${API_URL}/Chapter?select=bookId,Book!inner(id,judul,cover)&Book.type=${NOT_NOVEL}&order=created_at.desc&offset=${(page - 1) * 30}&limit=30`,
      );
      const seen = new Set<number>();
      const items = chapters
        .map((c) => c.Book)
        .filter((b): b is BookDto => Boolean(b) && !seen.has(b!.id) && Boolean(seen.add(b!.id)))
        .map(toSummary);
      return { items, hasNextPage: chapters.length === 30 };
    },

    async search(query: string, page: number, state: FilterState): Promise<MangaPage> {
      const selects = ['id', 'judul', 'cover'];
      const types: Record<string, string> = { manga: 'eq.Manga', web: 'eq.Web Manga' };
      const statuses: Record<string, string> = {
        ongoing: 'eq.ongoing',
        completed: 'ilike.*complete*',
        oneshot: 'eq.oneshot',
      };
      const sort = state.sort as SortValue | undefined;
      const column =
        ({ updated: 'updated_at', added: 'created_at', title: 'judul' } as Record<string, string>)[
          sort?.value ?? 'updated'
        ] ?? 'updated_at';
      if (state.has_chapter === true) selects.push('Chapter!inner()');
      const genres = GENRES.filter(([, id]) => state[`genre.${id}`] === true).map(([, id]) => id);
      if (genres.length > 0) selects.push('Genre!inner(id)');
      const url = withQuery(`${API_URL}/Book`, {
        status: statuses[typeof state.status === 'string' ? state.status : ''],
        'Genre.id': genres.length > 0 ? `in.(${genres.join(',')})` : undefined,
        judul: query.trim() ? `ilike.*${query.trim()}*` : undefined,
        select: selects.join(','),
        type: types[typeof state.type === 'string' ? state.type : ''] ?? NOT_NOVEL,
        order: `${column}.${sort?.ascending ? 'asc' : 'desc'}`,
        offset: String((page - 1) * 20),
        limit: '20',
      });
      const books = await api<BookDto[]>(url);
      return { items: books.map(toSummary), hasNextPage: books.length === 20 };
    },

    getFilters: (): Filter[] => [
      { type: 'checkbox', id: 'has_chapter', label: 'Punya chapter' },
      {
        type: 'select',
        id: 'type',
        label: 'Tipe',
        options: [option('Semua', ''), option('Manga', 'manga'), option('Web Manga', 'web')],
      },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [
          option('Semua', ''),
          option('Ongoing', 'ongoing'),
          option('Completed', 'completed'),
          option('Oneshot', 'oneshot'),
        ],
      },
      {
        type: 'sort',
        id: 'sort',
        label: 'Urutkan',
        options: [option('Update Terakhir', 'updated'), option('Ditambahkan', 'added'), option('A-Z', 'title')],
        default: { value: 'updated', ascending: false },
      },
      {
        type: 'group',
        id: 'genre',
        label: 'Genre',
        filters: GENRES.map(([label, id]) => ({ type: 'checkbox', id: `genre.${id}`, label })),
      },
    ],

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const [book] = await api<BookDto[]>(
        `${API_URL}/Book?select=*%2Cgenres%3A_BookGenre%28genre%3AGenre%28*%29%29&type=${NOT_NOVEL}&id=eq.${lastSegment(manga.url)}`,
      );
      if (!book) throw new Error('Manga not found');
      return {
        ...toSummary(book),
        author: book.author || undefined,
        artist: book.artist || undefined,
        description: book.synopsis || undefined,
        status: parseStatus(book.status),
        genres: (book.genres ?? []).map((g) => g.genre?.nama).filter((n): n is string => Boolean(n)),
      };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const chapters = await api<ChapterDto[]>(
        `${API_URL}/Chapter?select=id,bookId,chapter,nama,created_at&bookId=eq.${lastSegment(manga.url)}&order=chapter.desc`,
      );
      return chapters.map((c) => {
        const number = c.chapter != null ? String(c.chapter).replace(/\.0$/, '') : '';
        // created_at is a local date-time without zone.
        const time = c.created_at
          ? Date.parse(c.created_at.endsWith('Z') ? c.created_at : `${c.created_at}Z`)
          : Number.NaN;
        return {
          url: `/view/${c.bookId}/${c.id}`,
          name: [number && `Chapter ${number}`, c.nama?.trim()].filter(Boolean).join(' - '),
          number: c.chapter ?? undefined,
          uploadedAt: Number.isFinite(time) ? time : undefined,
        };
      });
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const [data] = await api<ChapterDto[]>(
        `${API_URL}/Chapter?select=id,bookId,isigambar&id=eq.${lastSegment(chapter.url)}`,
      );
      if (!data) throw new Error('Chapter not found');
      let images: string[] = [];
      try {
        images = data.isigambar ? (JSON.parse(data.isigambar) as string[]) : [];
      } catch {
        images = [];
      }
      return images.map((imageUrl, index) => ({ index, imageUrl }));
    },

    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/(?:[^?#]*\/)?(?:detail|view)\/(\d+)/i.exec(url.trim());
      return match && match[1]?.toLowerCase() === hostOf(BASE_URL) ? { url: `/detail/${match[2]}`, title: '' } : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
