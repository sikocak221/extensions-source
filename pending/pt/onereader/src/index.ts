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
import { USER_AGENT, absoluteUrl, hostOf, parseDate } from './common/utils';

const BASE_URL = 'https://onereader.net';
const API_URL = 'https://api.onereader.net';
const PAGE_SIZE = 24;
const HOME_LIMIT = 60;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface HomeMangaDto {
  manga_key: string;
  display_name: string;
  status: string;
  cover_image: string;
}
interface MangaDto {
  manga_key: string;
  display_name: string;
  name: string;
  japanese_name?: string | null;
  author?: string | null;
  artist?: string | null;
  synopsis?: string | null;
  status: string;
  type: string;
  origin_country: string;
  year: number;
  tags: string[] | string | null;
  cover_image: string;
  publisher_name?: string | null;
}

async function api<T>(path: string): Promise<T> {
  return (await http.get<T>(API_URL + path, { headers, responseType: 'json' })).body;
}

function toStatus(status: string): MangaStatus {
  switch (status.trim().toLowerCase()) {
    case 'em lançamento':
    case 'lançando':
      return 'ongoing';
    case 'completo':
      return 'completed';
    case 'hiatus':
    case 'hiato':
      return 'hiatus';
    case 'cancelado':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

/** The api sends tags as a json array, or as a json string of one. */
function tagsOf(tags: MangaDto['tags']): string[] {
  if (Array.isArray(tags)) return tags;
  if (typeof tags === 'string') {
    try {
      const parsed = JSON.parse(tags) as unknown;
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

const keyOf = (url: string) => url.replace(/^\/manga\//, '');
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

async function search(
  page: number,
  query: string,
  order: string,
  genre: string,
  type: string,
  status: string,
): Promise<MangaPage> {
  const q = (v: string) => encodeURIComponent(v);
  const result = await api<{ data: MangaDto[]; page: number; totalPages: number }>(
    `/api/mangas/search?page=${page}&limit=${PAGE_SIZE}&order=${order}&role=standard&search=${q(query.trim())}&genre=${q(genre)}&type=${q(type)}&status=${q(status)}`,
  );
  return {
    items: result.data.map((m) => ({
      url: `/manga/${m.manga_key}`,
      title: m.display_name,
      thumbnailUrl: m.cover_image,
    })),
    hasNextPage: result.page < result.totalPages,
  };
}

const select = (id: string, label: string, options: [string, string][]): Filter => ({
  type: 'select',
  id,
  label,
  default: options[0]![1],
  options: options.map(([l, value]) => ({ label: l, value })),
});

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => search(page, '', 'az', '', '', ''),
    async getLatest(): Promise<MangaPage> {
      const mangas = await api<HomeMangaDto[]>(`/api/mangas/home?limit=${HOME_LIMIT}`);
      return {
        items: mangas.map((m) => ({
          url: `/manga/${m.manga_key}`,
          title: m.display_name,
          thumbnailUrl: m.cover_image,
        })),
        hasNextPage: false,
      };
    },
    async getFilters(): Promise<Filter[]> {
      const filters: Filter[] = [
        select('order', 'Ordenar por', [
          ['A-Z', 'az'],
          ['Atualizados recentemente', 'recent'],
        ]),
        select('status', 'Status', [
          ['Todos', ''],
          ['Em lançamento', 'Em Lançamento'],
          ['Completo', 'Completo'],
          ['Hiato', 'Hiatus'],
          ['Cancelado', 'Cancelado'],
        ]),
      ];
      try {
        const [tags, types] = await Promise.all([api<string[]>('/api/tags'), api<string[]>('/api/types')]);
        filters.push(
          select('type', 'Tipo', [
            ['Todos', ''],
            ...types.filter((t) => t.trim()).map((t): [string, string] => [t, t]),
          ]),
          select('genre', 'Tag', [['Todas', ''], ...tags.filter((t) => t.trim()).map((t): [string, string] => [t, t])]),
        );
      } catch {
        // tags and types are optional
      }
      return filters;
    },
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const value = (id: string, fallback = '') =>
        typeof filters[id] === 'string' ? (filters[id] as string) : fallback;
      return search(page, query, value('order', 'az'), value('genre'), value('type'), value('status'));
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const m = await api<MangaDto>(`/api/mangas/${keyOf(manga.url)}`);
      const metadata: string[] = [];
      if (m.name.trim() && !same(m.name, m.display_name)) metadata.push(`Título original: ${m.name}`);
      const jp = m.japanese_name;
      if (jp?.trim() && !same(jp, m.display_name) && !same(jp, m.name)) metadata.push(`Título nativo: ${jp}`);
      if (m.type.trim()) metadata.push(`Tipo: ${m.type}`);
      if (m.origin_country.trim()) metadata.push(`País: ${m.origin_country}`);
      metadata.push(`Ano: ${m.year}`);
      if (m.publisher_name?.trim()) metadata.push(`Editora: ${m.publisher_name}`);
      const synopsis = m.synopsis?.trim() ?? '';
      const tags = tagsOf(m.tags);
      return {
        url: manga.url,
        title: m.display_name,
        thumbnailUrl: m.cover_image,
        author: m.author?.trim() || undefined,
        artist: m.artist?.trim() || undefined,
        genres: tags.length ? tags : undefined,
        status: toStatus(m.status),
        description: (synopsis + (synopsis ? '\n\n' : '') + metadata.join('\n')).trim() || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const chapters = await api<Record<string, { manga_key: string; posted_date: string }>>(
        `/api/chapters/${keyOf(manga.url)}`,
      );
      return Object.entries(chapters)
        .sort((a, b) => (Number.parseFloat(b[0]) || -Infinity) - (Number.parseFloat(a[0]) || -Infinity))
        .map(([number, c]) => ({
          url: `/chapter/${c.manga_key}/${number}`,
          name: `Capítulo ${number}`,
          number: Number.parseFloat(number) || -1,
          uploadedAt: parseDate(c.posted_date, "yyyy-MM-dd'T'HH:mm:ss'Z'"),
        }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [key = '', number = ''] = chapter.url.replace('/chapter/', '').split('/');
      const result = await api<{ pages: string[] }>(`/api/chapters/${key}/${number.replace('.', '_')}`);
      return result.pages.map((path, index) => ({ index, imageUrl: absoluteUrl(API_URL, path) }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/manga-details\?(?:[^#]*&)?id=([^&#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL)
        ? { url: `/manga/${decodeURIComponent(match[2]!)}`, title: '' }
        : null;
    },
    getWebUrl(item): string {
      const [key = '', number] = item.url.replace(/^\/(?:manga|chapter)\//, '').split('/');
      return number !== undefined && 'name' in item
        ? `${BASE_URL}/leitor?id=${encodeURIComponent(key)}&capitulo=${encodeURIComponent(number)}`
        : `${BASE_URL}/manga-details?id=${encodeURIComponent(keyOf(item.url))}`;
    },
  }),
});
