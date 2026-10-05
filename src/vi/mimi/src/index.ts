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

const BASE_URL = 'https://mimihentai.moe';
const API_URL = `${BASE_URL}/api`;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface Named {
  id?: number | null;
  name: string;
}

interface MangaDto {
  id: number;
  title: string;
  cover_url?: string | null;
  description?: string | null;
  alt_names?: string[];
  authors?: Named[];
  genres?: Named[];
  parodies?: Named[];
  characters?: Named[];
}

interface ListDto {
  items?: MangaDto[];
  has_next?: boolean;
}

async function api<T>(path: string): Promise<T> {
  return (await http.get<T>(API_URL + path, { headers, responseType: 'json' })).body;
}

const summary = (m: MangaDto): MangaSummary => ({
  url: `/manga/${m.id}`,
  title: m.title,
  thumbnailUrl: m.cover_url || undefined,
});
const idOf = (url: string) => url.split('/')[2] ?? '';

async function list(path: string): Promise<MangaPage> {
  const result = await api<ListDto>(path);
  return { items: (result.items ?? []).map(summary), hasNextPage: result.has_next ?? false };
}

// Genre 196 is left out of the default listings, as on the site.
const common = (page: number) => `exclude_genre=196&page=${page}&page_size=45`;

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`/manga?sort=views&${common(page)}`),
    getLatest: (page) => list(`/manga?sort=updated_at&${common(page)}`),
    async getFilters(): Promise<Filter[]> {
      const genres = await api<Named[]>('/genres').catch(() => []);
      return [
        {
          type: 'select',
          id: 'sort',
          label: 'Sắp xếp',
          default: '',
          options: [
            { label: 'Mặc định', value: '' },
            { label: 'Mới', value: 'updated_at' },
            { label: 'Likes', value: 'likes' },
            { label: 'Views', value: 'views' },
            { label: 'Lưu', value: 'follows' },
            { label: 'Tên', value: 'title' },
          ],
        },
        { type: 'text', id: 'parody', label: 'Parody' },
        { type: 'text', id: 'character', label: 'Nhân vật' },
        { type: 'header', label: 'ID Tác giả (chỉ nhập số)' },
        { type: 'text', id: 'author', label: 'ID Tác giả' },
        ...(genres.length
          ? [
              {
                type: 'group' as const,
                id: 'genres',
                label: 'Thể loại',
                filters: [...genres]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((g): Filter => ({ type: 'tristate', id: `genre.${g.id}`, label: g.name })),
              },
            ]
          : []),
      ];
    },
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string).trim() : '');
      const genres = Object.entries(filters).filter(
        ([id, v]) => id.startsWith('genre.') && (v === 'include' || v === 'exclude'),
      );
      const advanced = genres.length > 0 || ['parody', 'character', 'author'].some((id) => text(id));
      const sort = text('sort');
      const params: string[] = [];
      let path = '/manga';
      if (advanced) {
        path += '/advanced-search';
        for (const [id, v] of genres) params.push(`${v === 'include' ? 'genre' : 'exclude_genre'}=${id.slice(6)}`);
        if (text('parody')) params.push(`parody=${encodeURIComponent(text('parody'))}`);
        if (text('character')) params.push(`character=${encodeURIComponent(text('character'))}`);
        if (/^\d+$/.test(text('author'))) params.push(`author=${text('author')}`);
      } else if (!sort) path += '/search';
      else params.push(`sort=${sort}`);
      params.push(`page=${page}`, 'page_size=24');
      if (query.trim()) params.push(`title=${encodeURIComponent(query.trim())}`);
      return list(`${path}?${params.join('&')}`);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const m = await api<MangaDto>(`/manga/${idOf(manga.url)}`);
      const section = (label: string, values: string[]) => (values.length ? `${label}: ${values.join(', ')}\n\n` : '');
      const description =
        section('Tên khác', m.alt_names ?? []) +
        section(
          'Parody',
          (m.parodies ?? []).map((p) => p.name.trim()),
        ) +
        section(
          'Nhân vật',
          (m.characters ?? []).map((c) => c.name.trim()),
        ) +
        section(
          'Code author',
          (m.authors ?? []).map((a) => String(a.id ?? '').trim()),
        ) +
        `Code manga: ${m.id}\n\n${m.description ?? ''}`;
      return {
        ...summary(m),
        description: description.trim(),
        author: (m.authors ?? []).map((a) => a.name).join(', ') || undefined,
        genres: (m.genres ?? []).map((g) => g.name),
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const id = idOf(manga.url);
      const chapters = await api<{ id: number; title?: string | null; order?: number; created_at?: string | null }[]>(
        `/manga/${id}/chapters`,
      );
      return chapters.map((c) => {
        // Times are Vietnam time without an offset.
        const time = c.created_at ? Date.parse(`${c.created_at.slice(0, 19)}+07:00`) : Number.NaN;
        return {
          url: `/manga/${id}/chapter/${c.id}`,
          name: c.title?.trim() || `Chapter ${c.order ?? 0}`,
          number: c.order,
          uploadedAt: Number.isNaN(time) ? undefined : time,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const result = await api<{ pages?: { image_url: string }[] }>(`/chapters/${chapter.url.split('/').pop()}`);
      return (result.pages ?? []).map((p, index) => ({ index, imageUrl: p.image_url }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/manga\/(\d+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/manga/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
