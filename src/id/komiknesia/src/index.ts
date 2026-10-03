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
import { USER_AGENT, withQuery } from './common/utils';

const BASE_URL = 'https://v1.komiknesiaku.com';
const API_URL = 'https://api-be.komiknesia.my.id/api';

// Manga urls are "/komik/<slug>", chapter urls "/view/<slug>", like the site's pages.

interface MangaDto {
  title: string;
  slug: string;
  alternative_name?: string | null;
  author?: string | null;
  sinopsis?: string | null;
  cover?: string | null;
  status?: string | null;
  genres?: { id: number; name: string }[] | null;
  chapters?: {
    number: string;
    title: string;
    slug: string;
    created_at?: { time: number } | null;
    scheduled_release_at?: { time: number } | null;
  }[];
}

interface Payload<T> {
  data: T;
  meta?: { page: number; total_pages: number } | null;
}

const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, Accept: 'application/json' };

/** Some answers are {"encrypted": true, "data": base64(iv + AES-CBC), "time": t}; the key comes from t. */
function decrypt(data: string, time: number): string {
  const key = (time / 32).toFixed(8).padEnd(32, '0').slice(0, 32);
  const raw = base64.decodeBytes(data);
  if (raw.length < 16) throw new Error('Encrypted data too short');
  const plain = crypto.aesDecrypt(raw.slice(16), key, { mode: 'cbc', iv: raw.slice(0, 16) });
  return utf8.decode([...plain]);
}

async function api<T>(url: string): Promise<Payload<T>> {
  const response = await http.get(url, { headers });
  const body = JSON.parse(response.body) as { encrypted?: boolean; data?: unknown; time?: number };
  if (body.encrypted === true && typeof body.data === 'string' && typeof body.time === 'number') {
    return JSON.parse(decrypt(body.data, body.time)) as Payload<T>;
  }
  return body as Payload<T>;
}

const slugOf = (url: string) => url.replace(/\/+$/, '').split('/').pop() ?? '';
const STATUSES: Record<string, MangaStatus> = { ongoing: 'ongoing', completed: 'completed', hiatus: 'hiatus' };

function toSummary(m: MangaDto): MangaSummary {
  return { url: `/komik/${m.slug}`, title: m.title, thumbnailUrl: m.cover || undefined };
}

function toDetails(m: MangaDto): MangaDetails {
  let description = (m.sinopsis ?? '').replace(/<\/?p\s*\/?>/g, '').trim();
  const alternatives = (m.alternative_name ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
  if (alternatives.length > 0)
    description += `${description ? '\n\n' : ''}Alternative Names:\n${alternatives.join('\n')}`;
  return {
    ...toSummary(m),
    author: m.author || undefined,
    description: description || undefined,
    genres: m.genres?.map((g) => g.name),
    status: STATUSES[m.status?.toLowerCase() ?? ''] ?? 'unknown',
  };
}

async function contents(page: number, query: string, state: FilterState): Promise<MangaPage> {
  let url = withQuery(`${API_URL}/contents`, {
    page: String(page),
    q: query.trim() || undefined,
    status: typeof state.status === 'string' && state.status ? state.status : undefined,
    orderBy: typeof state.order === 'string' && state.order ? state.order : undefined,
  });
  for (const [id, value] of Object.entries(state)) {
    if (id.startsWith('genre.') && value === true) url += `&${encodeURIComponent('genre[]')}=${id.slice(6)}`;
  }
  const payload = await api<MangaDto[]>(url);
  return {
    items: payload.data.map(toSummary),
    hasNextPage: payload.meta ? payload.meta.page < payload.meta.total_pages : false,
  };
}

const option = (label: string, value: string) => ({ label, value });

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    getPopular: (page) => contents(page, '', { order: 'Popular' }),

    getLatest: (page) => contents(page, '', {}),

    search: (query, page, state) => contents(page, query, state),

    async getFilters(): Promise<Filter[]> {
      const filters: Filter[] = [
        {
          type: 'select',
          id: 'order',
          label: 'Order by',
          options: [
            option('Update', ''),
            option('Added', 'Added'),
            option('Popular', 'Popular'),
            option('Title (A-Z)', 'Az'),
            option('Title (Z-A)', 'Za'),
          ],
        },
        {
          type: 'select',
          id: 'status',
          label: 'Status',
          options: [
            option('All', ''),
            option('Ongoing', 'Ongoing'),
            option('Completed', 'Completed'),
            option('Hiatus', 'Hiatus'),
          ],
        },
      ];
      try {
        const genres = (await api<{ id: number; name: string }[]>(`${API_URL}/contents/genres`)).data;
        if (genres.length > 0) {
          filters.push({
            type: 'group',
            id: 'genre',
            label: 'Genres',
            filters: genres.map((g) => ({ type: 'checkbox', id: `genre.${g.id}`, label: g.name })),
          });
        }
      } catch (error) {
        log.warn('Cannot load genres', error);
      }
      return filters;
    },

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      return toDetails((await api<MangaDto>(`${API_URL}/comic/${slugOf(manga.url)}`)).data);
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { data } = await api<MangaDto>(`${API_URL}/comic/${slugOf(manga.url)}`);
      // Chapters marked premium on the website are served by the API anyway.
      return (data.chapters ?? []).map((c) => {
        const number = Number.parseFloat(c.number);
        const time = (c.scheduled_release_at?.time ?? c.created_at?.time ?? 0) * 1000;
        return {
          url: `/view/${c.slug}`,
          name: c.title,
          number: Number.isFinite(number) ? number : undefined,
          uploadedAt: time || undefined,
        };
      });
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const { data } = await api<{ images: string[] }>(`${API_URL}/chapters/slug/${slugOf(chapter.url)}`);
      return data.images.map((imageUrl, index) => ({ index, imageUrl }));
    },

    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:[^/]+\.)?komiknesiaku\.com\/komik\/([^/?#]+)/i.exec(url.trim());
      return match ? { url: `/komik/${match[1]}`, title: '' } : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
