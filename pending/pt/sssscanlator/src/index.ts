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

const BASE_URL = 'https://yomu.com.br';
const API_URL = 'https://yomu.tauruus.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface SeriesDto {
  slug: string;
  title: string;
  cover?: string | null;
}
interface ChapterDto {
  id: string;
  number: number;
  title?: string | null;
  releaseDate?: string | null;
  releaseAt?: string | null;
}
interface MangaDto extends SeriesDto {
  description?: string | null;
  author?: string | null;
  artist?: string | null;
  status?: string | null;
  genres?: string[];
  chapters?: ChapterDto[];
}

async function api<T>(path: string): Promise<T> {
  return (await http.get<T>(API_URL + path, { headers, responseType: 'json' })).body;
}

const summary = (s: SeriesDto): MangaSummary => ({
  url: `/obra/${s.slug}`,
  title: s.title,
  thumbnailUrl: s.cover?.trim() || undefined,
});

const STATUS: Record<string, MangaStatus> = {
  ONGOING: 'ongoing',
  COMPLETED: 'completed',
  HIATUS: 'hiatus',
  CANCELED: 'cancelled',
  CANCELLED: 'cancelled',
};

async function list(page: number, query: string, params: string[]): Promise<MangaPage> {
  const all = [`page=${page}`, ...params];
  if (query.trim()) all.push(`q=${encodeURIComponent(query)}`);
  const result = await api<{ series?: SeriesDto[]; hasNextPage?: boolean }>(`/list?${all.join('&')}`);
  return { items: (result.series ?? []).map(summary), hasNextPage: result.hasNextPage ?? false };
}

const select = (id: string, label: string, options: [string, string][]): Filter => ({
  type: 'select',
  id,
  label,
  default: options[0]![1],
  options: options.map(([l, value]) => ({ label: l, value })),
});

const slugOf = (url: string) => url.slice(url.lastIndexOf('/') + 1);
// chapter url: `{id}|{slug}|{number}`, the location is needed for the web url and the pages.
const chapterNumber = (n: number) => String(n).replace(/\.0$/, '');

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(page, '', ['sort=popular']),
    getLatest: (page) => list(page, '', ['sort=newest']),
    async getFilters(): Promise<Filter[]> {
      const genres = await api<string[]>('/genres').catch(() => [] as string[]);
      return [
        select('sort', 'Ordenar por', [
          ['Mais recentes', 'newest'],
          ['Mais populares', 'popular'],
          ['Melhor nota', 'rating'],
          ['A-Z', 'az'],
        ]),
        select('type', 'Tipo', [
          ['Todos', ''],
          ['Mangá', 'MANGA'],
          ['Manhwa', 'MANHWA'],
          ['Manhua', 'MANHUA'],
          ['Novel', 'NOVEL'],
          ['Yaoi', 'YAOI'],
          ['Yuri', 'YURI'],
          ['Shoujo', 'SHOUJO'],
          ['English', 'ENGLISH'],
          ['Webtoon', 'WEBTOON'],
          ['Doujinshi', 'DOUJINSHI'],
          ['Hentai', 'HENTAI'],
          ['Pornhwa', 'PORNHWA'],
        ]),
        select('status', 'Status', [
          ['Todos', ''],
          ['Em lançamento', 'ONGOING'],
          ['Completo', 'COMPLETED'],
          ['Hiato', 'HIATUS'],
          ['Cancelado', 'CANCELED'],
        ]),
        ...(genres.length
          ? [select('genre', 'Gênero', [['Todos', ''], ...genres.map((g): [string, string] => [g, g])])]
          : []),
      ];
    },
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params: string[] = [];
      for (const key of ['sort', 'type', 'status', 'genre']) {
        const v = filters[key];
        if (typeof v === 'string' && v) params.push(`${key}=${encodeURIComponent(v)}`);
      }
      return list(page, query, params);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const m = await api<MangaDto>(`/manga/${slugOf(manga.url)}`);
      return {
        ...summary(m),
        description: m.description?.trim() || undefined,
        author: m.author?.trim() || undefined,
        artist: m.artist?.trim() || undefined,
        genres: m.genres ?? [],
        status: STATUS[(m.status ?? '').toUpperCase()] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const m = await api<MangaDto>(`/manga/${slugOf(manga.url)}`);
      return (m.chapters ?? []).map((c) => {
        const label = chapterNumber(c.number);
        const released = c.releaseAt ? Date.parse(c.releaseAt) : Number.NaN;
        return {
          url: `${c.id}|${m.slug}|${label}`,
          name: c.title?.trim() || `Capítulo ${label}`,
          number: c.number,
          uploadedAt: Number.isNaN(released) ? parseDate(c.releaseDate, 'dd/MM/yyyy') : released,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [, slug, number] = chapter.url.split('|');
      if (!slug || !number) throw new Error('Atualize a lista de capítulos');
      const result = await api<{ pages?: string[] }>(`/chapter/${slug}/${number}`);
      return (result.pages ?? []).map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/(?:obra|ler)\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/obra/${match[2]}`, title: '' } : null;
    },
    getWebUrl(item): string {
      if (!('name' in item)) return BASE_URL + item.url;
      const [, slug, number] = item.url.split('|');
      return `${BASE_URL}/ler/${slug}/${number}`;
    },
  }),
});
