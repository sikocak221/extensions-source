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
import { USER_AGENT, hostOf } from './common/utils';

const BASE_URL = 'https://truyenkira.net';
const API_URL = `https://api.${hostOf(BASE_URL)}`;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const apiHeaders = { ...headers, Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
const LOCKED_MESSAGE = 'Vui lòng đăng nhập bằng tài khoản phù hợp qua webview để xem chương này';

interface ComicList {
  comics?: {
    id?: string | null;
    title: string;
    thumbnail?: string | null;
    banner_image_url?: string | null;
    type?: string | null;
  }[];
  current_page?: number;
  total_pages?: number;
}

interface ComicDetails {
  title: string;
  thumbnail?: string | null;
  banner_image_url?: string | null;
  description?: string | null;
  authors?: string | null;
  status?: string | null;
  genres?: { id?: string | null; name?: string | null }[];
  chapters?: { id?: number | null; name?: string | null; coinPrice?: number | null; unlockAt?: string | null }[];
}

async function api<T>(path: string): Promise<T> {
  return (await http.get<T>(API_URL + path, { headers: apiHeaders, responseType: 'json' })).body;
}

function toPage(list: ComicList): MangaPage {
  const items = (list.comics ?? []).flatMap((c): MangaSummary[] =>
    c.id && c.type?.toLowerCase() !== 'novel'
      ? [{ url: `/comics/${c.id}`, title: c.title, thumbnailUrl: c.thumbnail || c.banner_image_url || undefined }]
      : [],
  );
  return { items, hasNextPage: (list.current_page ?? 1) < (list.total_pages ?? 1) };
}

function genreList(page: number, genre = 'all', sort?: string, status?: string): Promise<MangaPage> {
  const params = [`type=${genre}`, `page=${page}`];
  if (sort) params.push(`sort=${sort}`);
  if (status) params.push(`status=${status}`);
  return api<ComicList>(`/genres/${genre}?${params.join('&')}`).then(toPage);
}

const slugOf = (url: string) => /\/comics\/([^/?#]+)/.exec(url)?.[1] ?? '';

const STATUS: Record<string, MangaStatus> = { updating: 'ongoing', ongoing: 'ongoing', completed: 'completed' };

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => genreList(page, 'all', 'views'),
    getLatest: (page) => genreList(page),
    async getFilters(): Promise<Filter[]> {
      const data = await api<{ data?: { genres?: { id?: string | null; name?: string | null }[] } }>('/genres').catch(
        () => undefined,
      );
      const genres = (data?.data?.genres ?? []).filter((g): g is { id: string; name: string } =>
        Boolean(g.id && g.name),
      );
      return [
        ...(genres.length
          ? [
              { type: 'header' as const, label: 'Thể loại' },
              {
                type: 'select' as const,
                id: 'genre',
                label: 'Thể loại',
                default: 'all',
                options: [{ label: 'Tất cả', value: 'all' }, ...genres.map((g) => ({ label: g.name, value: g.id }))],
              },
            ]
          : []),
        {
          type: 'select',
          id: 'sort',
          label: 'Sắp xếp',
          default: '',
          options: [
            { label: 'Mới cập nhật', value: '' },
            { label: 'Lượt xem', value: 'views' },
            { label: 'Mới thêm', value: 'new' },
          ],
        },
        {
          type: 'select',
          id: 'status',
          label: 'Trạng thái',
          default: '',
          options: [
            { label: 'Tất cả', value: '' },
            { label: 'Đang ra', value: 'updating' },
            { label: 'Hoàn thành', value: 'completed' },
          ],
        },
      ];
    },
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim())
        return toPage(await api<ComicList>(`/search?q=${encodeURIComponent(query.trim())}&page=${page}`));
      const value = (id: string) =>
        typeof filters[id] === 'string' && filters[id] ? (filters[id] as string) : undefined;
      return genreList(page, value('genre') ?? 'all', value('sort'), value('status'));
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const slug = slugOf(manga.url);
      const d = await api<ComicDetails>(`/comics/${slug}`);
      return {
        url: `/comics/${slug}`,
        title: d.title,
        thumbnailUrl: d.thumbnail || d.banner_image_url || undefined,
        author: d.authors || undefined,
        status: STATUS[d.status?.toLowerCase() ?? ''] ?? 'unknown',
        genres: (d.genres ?? []).map((g) => g.name).filter((n): n is string => Boolean(n)),
        description: d.description || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const slug = slugOf(manga.url);
      const d = await api<ComicDetails>(`/comics/${slug}`);
      return (d.chapters ?? []).flatMap((c): Chapter[] => {
        if (c.id == null || !c.name) return [];
        const locked = (c.coinPrice ?? 0) > 0;
        const unlock = c.unlockAt ? Date.parse(c.unlockAt) : Number.NaN;
        const label = Number.isNaN(unlock)
          ? ''
          : ` [Mở khóa: ${new Date(unlock + 7 * 3_600_000).toISOString().slice(5, 10).split('-').reverse().join('/')}]`;
        return [
          {
            url: `/chapters/${slug}/${c.id}${locked ? '?is_locked=1' : ''}`,
            name: locked ? `🔒 ${c.name}${label}` : c.name,
            uploadedAt: Number.isNaN(unlock) ? undefined : unlock,
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      if (chapter.url.includes('is_locked=1')) throw new Error(LOCKED_MESSAGE);
      const [, slug, id] = /\/chapters\/([^/?#]+)\/([^/?#]+)/.exec(chapter.url) ?? [];
      const response = await http.request<{ images?: { src?: string | null }[]; message?: string }>({
        url: `${API_URL}/comics/${slug}/chapters/${id}`,
        headers: apiHeaders,
        responseType: 'json',
      });
      if (response.status >= 400) throw new Error(response.body?.message ?? 'Không thể tải dữ liệu chương');
      const urls = (response.body.images ?? []).map((i) => i.src).filter((s): s is string => Boolean(s));
      if (!urls.length) throw new Error(LOCKED_MESSAGE);
      return urls.map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/(?:comics|chapters)\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/comics/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url.replace('?is_locked=1', ''),
  }),
});
