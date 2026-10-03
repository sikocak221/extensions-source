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
  parseRelativeDate,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, parseDate, withQuery } from './common/utils';

const BASE_URL = 'https://01.komiku.asia';
const API_URL = `${BASE_URL}/api/v2`;

// Manga urls are "/manga/<slug>"; chapter urls "/<comic id>/<chapter id>" (what the page API needs).

interface ComicDto {
  id: number;
  slug: string;
  title: string;
  genres?: string[] | null;
  comicStatus?: string | null;
  author?: string | null;
  artist?: string | null;
  synopsis?: string | null;
  coverUrl?: string | null;
}

interface ChapterDto {
  id: number;
  n?: number | null;
  title?: string | null;
  releasedLabel?: string | null;
}

const headers = {
  'User-Agent': USER_AGENT,
  Referer: `${BASE_URL}/`,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
};

async function api<T>(url: string): Promise<T> {
  return (await http.get<T>(url, { headers, responseType: 'json' })).body;
}

const STATUS: Record<string, MangaStatus> = {
  ongoing: 'ongoing',
  completed: 'completed',
  hiatus: 'hiatus',
  cancelled: 'cancelled',
  canceled: 'cancelled',
};

function toSummary(comic: ComicDto): MangaSummary {
  return { url: `/manga/${comic.slug}`, title: comic.title, thumbnailUrl: comic.coverUrl || undefined };
}

function toDetails(comic: ComicDto): MangaDetails {
  return {
    ...toSummary(comic),
    author: [comic.author, comic.artist].filter((name) => name?.trim()).join(', ') || undefined,
    description: comic.synopsis || undefined,
    genres: comic.genres ?? undefined,
    status: STATUS[comic.comicStatus?.toLowerCase() ?? ''] ?? 'unknown',
  };
}

async function comicList(url: string): Promise<MangaPage> {
  const result = await api<{ items?: ComicDto[] | null; page?: number | null; totalPages?: number | null }>(url);
  return { items: (result.items ?? []).map(toSummary), hasNextPage: (result.page ?? 0) < (result.totalPages ?? 0) };
}

/** "baru saja", "5 menit", "2 jam", "3 hari" or "9 Feb 2022" / "28 Agu 2022". */
function parseLabel(label: string | null | undefined): number | undefined {
  if (!label) return undefined;
  if (label.includes('baru saja')) return Date.now();
  const amount = Number(label.replace(/\D/g, '')) || 0;
  if (label.includes('menit')) return Date.now() - amount * 60_000;
  if (label.includes('jam')) return Date.now() - amount * 3_600_000;
  if (label.includes('hari')) return Date.now() - amount * 86_400_000;
  return parseDate(label, 'd MMM yyyy') ?? parseRelativeDate(label);
}

const slugOf = (url: string) => url.replace(/\/+$/, '').split('/').pop() ?? '';

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    getPopular: (page) => comicList(`${API_URL}/comics?sort=popular&page=${page}`),

    getLatest: (page) => comicList(`${API_URL}/comics?sort=update&page=${page}`),

    async search(query: string, page: number, state: FilterState): Promise<MangaPage> {
      const q = query.trim();
      // /comics/search requires `q`; browsing uses /comics with the filters.
      let url = withQuery(q ? `${API_URL}/comics/search` : `${API_URL}/comics`, { q: q || undefined });
      for (const id of ['sort', 'status', 'type']) {
        const value = state[id];
        if (typeof value === 'string' && value) url = withQuery(url, { [id]: value });
      }
      for (const [id, value] of Object.entries(state)) {
        if (id.startsWith('genres.') && value === true) url += `&genres=${encodeURIComponent(id.slice(7))}`;
      }
      url = withQuery(url, { page: String(page) });
      if (!q) return comicList(url);
      const items = (await api<ComicDto[]>(url)).map(toSummary);
      return { items, hasNextPage: items.length > 0 };
    },

    async getFilters(): Promise<Filter[]> {
      const data = await api<{
        genres?: string[] | null;
        statuses?: string[] | null;
        types?: string[] | null;
        sorts?: { key?: string | null; label?: string | null }[] | null;
      }>(`${API_URL}/comics/filters`);
      const options = (values: string[] | null | undefined) =>
        (values ?? []).map((v) => ({ label: v, value: v === 'Semua' ? '' : v }));
      return [
        {
          type: 'select',
          id: 'sort',
          label: 'Sort',
          options: (data.sorts ?? []).map((s) => ({ label: s.label ?? s.key ?? '', value: s.key ?? '' })),
          default: 'update',
        },
        {
          type: 'select',
          id: 'status',
          label: 'Status',
          options: options(data.statuses?.filter((s) => s !== 'ngoing')),
        },
        { type: 'select', id: 'type', label: 'Type', options: options(data.types) },
        {
          type: 'group',
          id: 'genres',
          label: 'Genre',
          filters: (data.genres ?? []).map((g) => ({ type: 'checkbox', id: `genres.${g}`, label: g })),
        },
      ];
    },

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      return toDetails(await api<ComicDto>(`${API_URL}/comics/${slugOf(manga.url)}`));
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const comic = await api<ComicDto>(`${API_URL}/comics/${slugOf(manga.url)}`);
      const chapters = await api<ChapterDto[]>(`${API_URL}/comics/${comic.id}/chapters`);
      return chapters.map((c) => ({
        url: `/${comic.id}/${c.id}`,
        name: c.title || `Chapter ${c.n ?? ''}`.trim(),
        number: c.n ?? undefined,
        uploadedAt: parseLabel(c.releasedLabel),
      }));
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const [comicId, chapterId] = chapter.url.split('/').filter(Boolean);
      const detail = await api<{ pages?: { url: string }[] | null }>(
        `${API_URL}/comics/${comicId}/chapters/id/${chapterId}`,
      );
      return (detail.pages ?? []).map((page, index) => ({ index, imageUrl: page.url }));
    },

    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/manga\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]?.toLowerCase() === hostOf(BASE_URL) ? { url: `/manga/${match[2]}`, title: '' } : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
