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
import { USER_AGENT, decodeEntities, htmlToText } from './common/utils';

const BASE_URL = 'https://klz9.com';
const CLIENT_ID = 'KL9K40zaSyC9K40vOMLLbEcepIFBhUKXwELqxlwTEF';
const FILTER_IMG = new Set([
  'https://1.bp.blogspot.com/-ZMyVQcnjYyE/W2cRdXQb15I/AAAAAAACDnk/8X1Hm7wmhz4hLvpIzTNBHQnhuKu05Qb0gCHMYCw/s0/LHScan.png',
  'https://s4.imfaclub.com/images/20190814/Credit_LHScan_5d52edc2409e7.jpg',
  'https://s4.imfaclub.com/images/20200112/5e1ad960d67b2_5e1ad962338c7.jpg',
]);
const IMG_HOSTS: Record<string, string> = {
  'imfaclub.com': 'j1.jfimv2.xyz',
  's2.imfaclub.com': 'j2.jfimv2.xyz',
  's4.imfaclub.com': 'j4.jfimv2.xyz',
  'ihlv1.xyz': 'j1.jfimv2.xyz',
  's2.ihlv1.xyz': 'j2.jfimv2.xyz',
  's4.ihlv1.xyz': 'j4.jfimv2.xyz',
  'h1.klimv1.xyz': 'j1.jfimv2.xyz',
  'h2.klimv1.xyz': 'j2.jfimv2.xyz',
  'h4.klimv1.xyz': 'j4.jfimv2.xyz',
};

interface MangaDto {
  artists?: string | null;
  authors?: string;
  cover: string;
  description?: string;
  genres?: string | string[] | null;
  m_status: number;
  name: string;
  other_name?: string;
  slug: string;
  chapters?: { chapter: number; id: number; name?: string | null; last_update: string; content?: string }[];
}
interface Paged {
  currentPage: number;
  totalPages: number;
  items: MangaDto[];
}

function sigHeaders(): Record<string, string> {
  const ts = String(Math.floor(Date.now() / 1000));
  return { 'User-Agent': USER_AGENT, 'X-Client-Sig': crypto.sha256(`${ts}.${CLIENT_ID}`), 'X-Client-Ts': ts };
}
const api = async <T>(path: string) =>
  (await http.get<T>(`${BASE_URL}/api/${path}`, { headers: sigHeaders(), responseType: 'json' })).body;

const summary = (m: MangaDto): MangaSummary => ({ url: `/${m.slug}`, title: m.name, thumbnailUrl: m.cover });
const genresOf = (g: MangaDto['genres']) =>
  (Array.isArray(g) ? g : (g ?? '').split(',')).map((x) => x.trim()).filter(Boolean);

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),
    async getPopular(): Promise<MangaPage> {
      return { items: (await api<MangaDto[]>('manga/trending-daily')).map(summary), hasNextPage: false };
    },
    async getLatest(page): Promise<MangaPage> {
      const r = await api<Paged>(`manga?page=${page}&limit=36`);
      return { items: r.items.map(summary), hasNextPage: r.currentPage < r.totalPages };
    },
    async getFilters(): Promise<Filter[]> {
      const filters: Filter[] = [
        {
          type: 'select',
          id: 'status',
          label: 'Status',
          options: [
            { value: '', label: 'All' },
            { value: 'Ongoing', label: 'Ongoing' },
            { value: 'Completed', label: 'Completed' },
          ],
        },
      ];
      try {
        const genres = await api<{ name: string }[]>('genres');
        if (genres.length)
          filters.push({
            type: 'group',
            id: 'genre',
            label: 'Genre',
            filters: genres.map((g): Filter => ({ type: 'checkbox', id: `genre.${g.name}`, label: g.name })),
          });
      } catch {
        // genres are optional
      }
      return filters;
    },
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const genres = Object.entries(filters)
        .filter(([id, v]) => id.startsWith('genre.') && v === true)
        .map(([id]) => id.slice(6))
        .join(',');
      const status = typeof filters.status === 'string' ? filters.status : '';
      const q =
        `manga/list?search=${encodeURIComponent(query)}&sort=Popular&order=desc&genre=${encodeURIComponent(genres)}` +
        `&status=${status}&page=${page}`;
      const r = await api<Paged>(q);
      return { items: r.items.map(summary), hasNextPage: r.currentPage < r.totalPages };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const m = await api<MangaDto>(`manga/slug/${manga.url.slice(1)}`);
      return {
        ...summary(m),
        author: m.authors,
        artist: m.artists ?? undefined,
        description: `${htmlToText(m.description ?? '')}\n\n${decodeEntities(m.other_name ?? '')}`.trim(),
        genres: genresOf(m.genres),
        status: m.m_status === 1 ? 'completed' : 'ongoing',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const m = await api<MangaDto>(`manga/slug/${manga.url.slice(1)}`);
      return (m.chapters ?? [])
        .sort((a, b) => b.chapter - a.chapter)
        .map((c) => ({
          url: `/${c.id}/${m.slug}-chapter-${c.chapter}`,
          name: c.name?.trim() ? c.name : `Chapter ${c.chapter}`,
          number: c.chapter,
          uploadedAt: Date.parse(c.last_update),
        }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const id = chapter.url.split('/')[1];
      const c = await api<{ content: string }>(`chapter/${id}`);
      return c.content
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !FILTER_IMG.has(l))
        .map((img, index) => {
          const host = /^https?:\/\/([^/]+)/.exec(img)?.[1] ?? '';
          const mapped = IMG_HOSTS[host];
          return { index, imageUrl: mapped ? img.replace(host, mapped) : img };
        });
    },
    getWebUrl(item) {
      const parts = item.url.split('/');
      return parts.length > 2 ? `${BASE_URL}/${parts[2]}.html` : `${BASE_URL}${item.url}.html`;
    },
  }),
});
