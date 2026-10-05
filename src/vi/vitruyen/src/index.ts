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
import { USER_AGENT, absoluteUrl, hostOf, htmlToText } from './common/utils';

const BASE_URL = 'https://vitruyen1.com';
const API_URL = `https://api.${hostOf(BASE_URL)}/api/next`;
const headers = { 'User-Agent': USER_AGENT };
const LOCKED_MESSAGE = 'Vui lòng đăng nhập vào tài khoản phù hợp bằng Webview để xem chương này';

interface Option {
  name: string;
  slug: string;
}
interface BrowseItem {
  slug: string;
  name: string;
  image?: string | null;
}
interface Listing {
  page: number;
  total_pages: number;
  items: BrowseItem[];
  filter_options?: { categories?: Option[]; translators?: Option[]; schedules?: Option[] };
}

const summary = (item: BrowseItem): MangaSummary => ({
  url: `/${item.slug}`,
  title: item.name,
  thumbnailUrl: item.image || undefined,
});

const api = async <T>(path: string): Promise<T> =>
  (await http.get<T>(`${API_URL}${path}`, { headers, responseType: 'json' })).body;
const qs = (params: [string, string | undefined][]) =>
  params.flatMap(([k, v]) => (v ? [`${k}=${encodeURIComponent(v)}`] : [])).join('&');

async function listing(page: number, sort: string, extra: [string, string | undefined][] = []): Promise<MangaPage> {
  const result = await api<Listing>(`/the-loai/dang-hot?${qs([['page', String(page)], ['sort', sort], ...extra])}`);
  return { items: result.items.map(summary), hasNextPage: result.page < result.total_pages };
}

const slugOf = (url: string) => url.replace(/^\//, '').split(/[/?#]/)[0] ?? '';

function filterOf(id: string, label: string, options: Option[]): Filter[] {
  return options.length
    ? [
        {
          type: 'select',
          id,
          label,
          options: [{ label: 'Tất cả', value: '' }, ...options.map((o) => ({ label: o.name, value: o.slug }))],
          default: '',
        },
      ]
    : [];
}

const text = (filters: FilterState, id: string) =>
  typeof filters[id] === 'string' && filters[id] ? (filters[id] as string) : undefined;

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => listing(page, 'view'),
    getLatest: (page) => listing(page, 'latest'),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) {
        const result = await api<{ page: number; total_pages: number; items: BrowseItem[] }>(
          `/search?${qs([
            ['q', query.trim()],
            ['page', String(page)],
          ])}`,
        );
        return { items: result.items.map(summary), hasNextPage: result.page < result.total_pages };
      }
      return listing(page, text(filters, 'sort') ?? 'latest', [
        ['status', text(filters, 'status')],
        ['category', text(filters, 'genre')],
        ['translator', text(filters, 'translator')],
        ['schedule', text(filters, 'schedule')],
      ]);
    },
    async getFilters(): Promise<Filter[]> {
      let options: NonNullable<Listing['filter_options']> = {};
      try {
        options = (await api<Listing>('/the-loai/dang-hot?page=1&sort=latest')).filter_options ?? {};
      } catch (error) {
        log.warn('Cannot load filters', error);
      }
      return [
        { type: 'header', label: 'Bộ lọc sẽ bị bỏ qua khi tìm kiếm theo tên' },
        {
          type: 'select',
          id: 'sort',
          label: 'Sắp xếp',
          options: [
            { label: 'Mới nhất', value: 'latest' },
            { label: 'Xem nhiều', value: 'view' },
          ],
          default: 'latest',
        },
        ...filterOf('status', 'Trạng thái', [
          { name: 'Đang ra', slug: 'ongoing' },
          { name: 'Hoàn thành', slug: 'completed' },
        ]),
        ...filterOf('genre', 'Thể loại', options.categories ?? []),
        ...filterOf('translator', 'Nhóm dịch', options.translators ?? []),
        ...filterOf('schedule', 'Lịch chiếu', options.schedules ?? []),
      ];
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const details = await api<
        BrowseItem & {
          descriptionHtml?: string | null;
          description?: string | null;
          isCompleted?: boolean | null;
          categories?: Option[];
        }
      >(`/manga/${slugOf(manga.url)}`);
      const description = details.descriptionHtml ?? details.description;
      return {
        ...summary(details),
        genres: (details.categories ?? []).map((c) => c.name),
        description: description ? htmlToText(description) || undefined : undefined,
        status: details.isCompleted === true ? 'completed' : details.isCompleted === false ? 'ongoing' : 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const details = await api<{ chapters?: { name: string; readUrl: string; publishedAt?: string | null }[] }>(
        `/manga/${slugOf(manga.url)}`,
      );
      return (details.chapters ?? []).map((c): Chapter => {
        const time = c.publishedAt ? Date.parse(c.publishedAt.replace(/(\.\d{3})\d+/, '$1')) : Number.NaN;
        return {
          url: `/${c.readUrl.replace(/^\/+|\/+$/g, '')}`,
          name: c.name,
          uploadedAt: Number.isNaN(time) ? undefined : time,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      // The API returns the content only to logged in users; guests read the images embedded in the reader page.
      const response = await http.get(absoluteUrl(BASE_URL, chapter.url), { headers });
      const urls = html
        .load(response.body, { baseUrl: response.url })
        .select('img.v2-reader-page-image[src]')
        .map((img) => img.absUrl('src'));
      if (urls.length === 0) throw new Error(LOCKED_MESSAGE);
      return urls.map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => ({ ...headers, Referer: `${BASE_URL}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/([^/?#]+)/i.exec(url.trim());
      const reserved = ['the-loai', 'tim-kiem', 'bang-xep-hang', 'lich-phat-hanh', 'nhom-dich', 'bookmark'];
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) && !reserved.includes(match[2]!)
        ? { url: `/${match[2]}`, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
