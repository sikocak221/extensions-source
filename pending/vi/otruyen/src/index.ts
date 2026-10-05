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
import { USER_AGENT, absoluteUrl, hostOf, htmlToText } from './common/utils';

const BASE_URL = 'https://otruyen.cc';
const API_URL = 'https://otruyenapi.com/v1/api';
const CDN_URL = 'https://sv1.otruyencdn.com';
const IMG_URL = 'https://img.otruyenapi.com/uploads/comics';
const headers = { 'User-Agent': USER_AGENT };

const STATUSES: [string, string][] = [
  ['truyen-moi', 'Mới nhất'],
  ['dang-phat-hanh', 'Đang phát hành'],
  ['hoan-thanh', 'Hoàn thành'],
  ['sap-ra-mat', 'Sắp ra mắt'],
];

interface EntriesData {
  name: string;
  slug: string;
  thumb_url?: string | null;
}

async function api<T>(url: string): Promise<T> {
  return (await http.get<{ data: T }>(url, { headers, responseType: 'json' })).body.data;
}

const summary = (e: EntriesData): MangaSummary => ({
  url: `/truyen-tranh/${e.slug}`,
  title: e.name,
  thumbnailUrl: e.thumb_url ? `${IMG_URL}/${e.thumb_url}` : undefined,
});

async function listing(segments: string[], page: number, extra = ''): Promise<MangaPage> {
  const data = await api<{
    items: EntriesData[];
    params: { pagination: { totalItems: number; totalItemsPerPage: number; currentPage: number } };
  }>(`${API_URL}/${segments.map(encodeURIComponent).join('/')}?page=${page}${extra}`);
  const { totalItems, totalItemsPerPage, currentPage } = data.params.pagination;
  return { items: data.items.map(summary), hasNextPage: currentPage < Math.ceil(totalItems / totalItemsPerPage) };
}

const slugOf = (url: string) => /\/truyen-tranh\/([^/?#]+)/.exec(url)?.[1] ?? '';

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => listing(['danh-sach', 'hoan-thanh'], page),
    getLatest: (page) => listing(['danh-sach', 'truyen-moi'], page),
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) return listing(['tim-kiem'], page, `&keyword=${encodeURIComponent(query.trim())}`);
      if (typeof filters.genre === 'string' && filters.genre) return listing(['the-loai', filters.genre], page);
      const status = typeof filters.status === 'string' && filters.status ? filters.status : 'dang-phat-hanh';
      return listing(['danh-sach', status], page);
    },
    async getFilters(): Promise<Filter[]> {
      const filters: Filter[] = [{ type: 'header', label: 'Không dùng chung được với tìm kiếm bằng tên' }];
      try {
        const data = await api<{ items: { slug: string; name: string }[] }>(`${API_URL}/the-loai`);
        const genres = data.items
          .map((g) => ({ label: g.name, value: g.slug }))
          .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
        if (genres.length) {
          filters.push({
            type: 'select',
            id: 'genre',
            label: 'Thể loại',
            options: [{ label: 'Tất cả', value: '' }, ...genres],
            default: '',
          });
          return filters;
        }
      } catch (error) {
        log.warn('Cannot load genres', error);
      }
      filters.push({
        type: 'select',
        id: 'status',
        label: 'Trạng thái',
        options: STATUSES.map(([value, label]) => ({ value, label })),
        default: 'dang-phat-hanh',
      });
      return filters;
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { item } = await api<{
        item: EntriesData & {
          origin_name: string[];
          content: string;
          status: string;
          author: string[];
          category: { name: string }[];
        };
      }>(`${API_URL}/truyen-tranh/${slugOf(manga.url)}`);
      const alt = item.origin_name.filter((n) => n.trim());
      const status: MangaStatus =
        item.status === 'ongoing' || item.status === 'coming_soon'
          ? 'ongoing'
          : item.status === 'completed'
            ? 'completed'
            : 'unknown';
      return {
        ...summary(item),
        author: item.author.join(', ') || undefined,
        description:
          `${alt.length ? `Tên khác: ${alt.join(', ')}\n\n` : ''}${htmlToText(item.content)}`.trim() || undefined,
        genres: item.category.map((c) => c.name),
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const slug = slugOf(manga.url);
      const { item } = await api<{
        item: {
          updatedAt: string;
          chapters: {
            server_data: { chapter_name: string; chapter_title?: string | null; chapter_api_data: string }[];
          }[];
        };
      }>(`${API_URL}/truyen-tranh/${slug}`);
      // The API has no date per chapter: the series' update time stands in.
      const updated = Date.parse(item.updatedAt);
      return item.chapters
        .flatMap((server) => server.server_data)
        .map((c): Chapter => ({
          url: `/truyen-tranh/${slug}#${c.chapter_api_data.split('/').pop()}`,
          name: `Chapter ${c.chapter_name}${c.chapter_title ? ` : ${c.chapter_title}` : ''}`,
          number: Number.parseFloat(c.chapter_name) || 0,
          uploadedAt: Number.isNaN(updated) ? undefined : updated,
        }))
        .sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const chapterId = chapter.url.split('#')[1] ?? '';
      const data = await api<{
        domain_cdn: string;
        item: { chapter_path: string; chapter_image: { image_file: string }[] };
      }>(`${CDN_URL}/v1/api/chapter/${chapterId}`);
      const base = `${data.domain_cdn}/${data.item.chapter_path}/`;
      return data.item.chapter_image.map((image, index) => ({ index, imageUrl: base + image.image_file }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/truyen-tranh\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL)
        ? { url: `/truyen-tranh/${match[2]}`, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url.split('#')[0]!),
  }),
});
