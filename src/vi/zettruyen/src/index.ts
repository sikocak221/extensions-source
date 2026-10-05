import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl } from './common/utils';
import { GENRES } from './genres';

const BASE_URL = 'https://www.zettruyen3.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const select = (id: string, label: string, options: [string, string][]): Filter => ({
  type: 'select',
  id,
  label,
  default: options[0]![1],
  options: options.map(([l, value]) => ({ label: l, value })),
});

const FILTERS: Filter[] = [
  select('sort', 'Sắp xếp', [
    ['Mới cập nhật', 'latest'],
    ['Xếp hạng', 'rating'],
    ['Số lượng bookmark', 'bookmark'],
    ['Tên A-Z', 'name_asc'],
    ['Tên Z-A', 'name_desc'],
  ]),
  select('status', 'Trạng thái', [
    ['Tất cả', 'all'],
    ['Đang tiến hành', 'Đang'],
    ['Hoàn thành', 'Hoàn thành'],
  ]),
  select('type', 'Loại truyện', [
    ['Tất cả', 'all'],
    ['Manga', 'manga'],
    ['Manhua', 'manhua'],
    ['Manhwa', 'manhwa'],
  ]),
  select('chapterRange', 'Số chương', [
    ['Tất cả', 'all'],
    ['1 - 100 chương', '1-100'],
    ['101 - 500 chương', '101-500'],
    ['501 - 1000 chương', '501-1000'],
    ['Trên 1000 chương', '1001-plus'],
  ]),
  {
    type: 'group',
    id: 'genres',
    label: 'Thể loại',
    filters: GENRES.map(([label, id]): Filter => ({ type: 'checkbox', id: `genre.${id}`, label })),
  },
];

async function search(page: number, params: Record<string, string>): Promise<MangaPage> {
  const query = Object.entries({ ...params, page: String(page) })
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  const document = await load(`/tim-kiem-nang-cao?${query}`);
  const items = document.select('div.grid a[href*="/truyen-tranh/"]').map((a): MangaSummary => ({
    url: relativeUrl(a.absUrl('href') ?? ''),
    title: a.selectFirst('span.line-clamp-2')?.text() ?? '',
    thumbnailUrl: a.selectFirst('img')?.absUrl('src') || undefined,
  }));
  return { items, hasNextPage: items.length > 0 };
}

/** `<div><div>label</div><div>value</div></div>` → value. */
function infoValue(document: HtmlElement, label: string): string | undefined {
  for (const div of document.select('div')) {
    const children = div.select('div');
    if (children.length === 2 && children[0]!.text().trim() === label) return children[1]!.text().trim() || undefined;
  }
  return undefined;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => search(page, { sort: 'rating' }),
    getLatest: (page) => search(page, { sort: 'latest' }),
    getFilters: () => FILTERS,
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params: Record<string, string> = {};
      if (query.trim()) params.name = query.trim();
      for (const id of ['sort', 'status', 'type', 'chapterRange']) {
        if (typeof filters[id] === 'string') params[id] = filters[id] as string;
      }
      const genres = Object.entries(filters)
        .filter(([id, value]) => id.startsWith('genre.') && value === true)
        .map(([id]) => id.slice(6));
      if (genres.length) params.genres = genres.join(',');
      return search(page, params);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const statusText = infoValue(document, 'Trạng thái')?.toLowerCase() ?? '';
      const status: MangaStatus = statusText.includes('đang tiến hành')
        ? 'ongoing'
        : statusText.includes('hoàn thành')
          ? 'completed'
          : 'unknown';
      const genreBlock = document
        .select('div.space-y-1')
        .find((div) => div.selectFirst('div')?.text().trim() === 'Thể loại');
      return {
        url: manga.url,
        title: document.selectFirst('h1')?.text() || manga.title,
        thumbnailUrl: document.selectFirst('img[src*="/thumb/"]')?.absUrl('src') || manga.thumbnailUrl,
        author: infoValue(document, 'Tác giả'),
        status,
        genres: genreBlock?.select('a').map((a) => a.text().trim()) ?? [],
        description: document.selectFirst('p.comic-content')?.text().trim() || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const slug = manga.url.replace(/\/$/, '').split('/').pop() ?? '';
      const chapters: Chapter[] = [];
      for (let page = 1, last = 1; page <= last; page++) {
        const result = (
          await http.get<{
            data?: {
              chapters: { chapter_name: string; chapter_slug: string; updated_at?: string | null }[];
              last_page?: number;
            };
          }>(`${BASE_URL}/api/comics/${slug}/chapters?page=${page}&per_page=100&order=desc`, {
            headers: { ...headers, Accept: 'application/json' },
            responseType: 'json',
          })
        ).body;
        last = result.data?.last_page ?? 1;
        for (const c of result.data?.chapters ?? []) {
          // Vietnam time without an offset.
          const time = c.updated_at ? Date.parse(`${c.updated_at.split('.')[0]}+07:00`) : Number.NaN;
          chapters.push({
            url: `/truyen-tranh/${slug}/${c.chapter_slug.replace('chapter-', 'chuong-')}`,
            name: c.chapter_name,
            uploadedAt: Number.isNaN(time) ? undefined : time,
          });
        }
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      let images = document.select('div.center img');
      if (!images.length) images = document.select('div.w-full.mx-auto.center img');
      return images
        .map((img) => img.absUrl('src') ?? '')
        .filter(Boolean)
        .map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => ({ ...headers, Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8' }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/truyen-tranh\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL)
        ? { url: `/truyen-tranh/${match[2]}`, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
