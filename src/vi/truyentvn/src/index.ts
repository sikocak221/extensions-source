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
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl } from './common/utils';
import { relativeDateVi } from './vidate';

const BASE_URL = 'https://truyentvn.net';
const AJAX_PATH = '/wp-admin/admin-ajax.php';
const CHAPTERS_PER_PAGE = 16;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

async function ajax<T>(form: Record<string, string>): Promise<T> {
  return (
    await http.post<T>(
      BASE_URL + AJAX_PATH,
      { form: { action: 'baka_ajax', ...form } },
      {
        headers: { ...headers, 'X-Requested-With': 'XMLHttpRequest' },
        responseType: 'json',
      },
    )
  ).body;
}

const imageOf = (img: HtmlElement | null | undefined) => img?.absUrl('src') || img?.absUrl('data-src') || undefined;

function card(a: HtmlElement): MangaSummary {
  const titleElement = a.selectFirst('h3, img[alt]');
  const title =
    a.attr('title') ||
    (titleElement?.attr('alt') && !titleElement.selectFirst('*')
      ? titleElement.attr('alt')!
      : (titleElement?.text() ?? ''));
  return { url: relativeUrl(a.absUrl('href') ?? ''), title, thumbnailUrl: imageOf(a.selectFirst('img')) };
}

async function listing(path: string): Promise<MangaPage> {
  const document = await load(path);
  const seen = new Set<string>();
  const items = document
    .select('main div.comic-card > a[href]')
    .map(card)
    .filter((m) => !seen.has(m.url) && Boolean(seen.add(m.url)));
  return { items, hasNextPage: items.length > 0 };
}

const paged = (path: string, page: number) => (page > 1 ? `${path}/page/${page}` : path);

const select = (id: string, label: string, options: [string, string][]): Filter => ({
  type: 'select',
  id,
  label,
  default: options[0]![1],
  options: options.map(([l, value]) => ({ label: l, value })),
});

interface ChaptersData {
  html?: string | null;
  pagination?: string | null;
}

async function chapterPage(
  parentId: string,
  page: number,
  perPage = CHAPTERS_PER_PAGE,
): Promise<ChaptersData | undefined> {
  const result = await ajax<{ success: boolean; data?: ChaptersData }>({
    type: 'load_chapters_paginated',
    parent_id: parentId,
    page: String(page),
    order: 'newest_first',
    per_page: String(perPage),
  });
  return result.success ? result.data : undefined;
}

function statusOf(text: string | undefined): MangaStatus {
  const value = text?.toLowerCase() ?? '';
  if (value.includes('đang tiến hành') || value.includes('đang cập nhật')) return 'ongoing';
  if (value.includes('hoàn thành')) return 'completed';
  return 'unknown';
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => listing(paged('/xem-nhieu-nhat', page)),
    getLatest: (page) => listing(paged('/moi-cap-nhat', page)),
    async getFilters(): Promise<Filter[]> {
      const body = (await http.get(`${BASE_URL}/advanced-search`, { headers })).body;
      const document = html.load(body, { baseUrl: BASE_URL });
      const categories = document
        .select('select[name=category] option[value]')
        .flatMap((o): [string, string][] => (o.attr('value') ? [[o.text(), o.attr('value')!]] : []));
      const genreJson = /window\.advancedSearchGenres\s*=\s*(\[.*?\])\s*;/s.exec(body)?.[1];
      const genres = genreJson ? (JSON.parse(genreJson) as { name: string; slug: string }[]) : [];
      return [
        select('country', 'Quốc gia', [
          ['Tất cả', ''],
          ['Nhật Bản', 'nhat-ban'],
          ['Trung Quốc', 'trung-quoc'],
          ['Hàn Quốc', 'han-quoc'],
          ['Việt Nam', 'viet-nam'],
        ]),
        select('status', 'Trạng thái', [
          ['Tất cả', ''],
          ['Đang tiến hành', 'ongoing'],
          ['Đã hoàn thành', 'completed'],
        ]),
        select('orderby', 'Sắp xếp', [
          ['Mới cập nhật', 'date'],
          ['Xem nhiều nhất', 'views'],
          ['Tiêu đề A-Z', 'title'],
          ['Yêu thích nhiều nhất', 'favorites'],
        ]),
        select('age_rating', 'Độ tuổi', [
          ['Tất cả', ''],
          ['Không 18+', 'non_18'],
          ['18+ (Người lớn)', 'is_18'],
        ]),
        select('chapters_range', 'Số chương', [
          ['Tất cả', ''],
          ['Một chương (Oneshot)', 'one'],
          ['2 - 10 chương', 'two_ten'],
          ['11 - 50 chương', 'eleven_fifty'],
          ['Nhiều hơn 50 chương', 'fifty_plus'],
        ]),
        ...(categories.length ? [select('category', 'Danh mục', [['Tất cả', ''], ...categories])] : []),
        ...(genres.length
          ? [
              {
                type: 'group' as const,
                id: 'genres',
                label: 'Thể loại',
                filters: genres.map((g): Filter => ({ type: 'tristate', id: `genre.${g.slug}`, label: g.name })),
              },
            ]
          : []),
      ];
    },
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) {
        const result = await ajax<{
          success: boolean;
          data?: { series?: { title: string; url: string; thumbnail?: string | null }[] };
        }>({ type: 'search_series', q: query.trim() });
        const series = result.success ? (result.data?.series ?? []) : [];
        return {
          items: series.map((s) => ({
            url: relativeUrl(s.url),
            title: s.title,
            thumbnailUrl: s.thumbnail || undefined,
          })),
          hasNextPage: false,
        };
      }
      const params: string[] = [];
      for (const id of ['country', 'status', 'orderby', 'age_rating', 'chapters_range', 'category']) {
        const value = filters[id];
        if (typeof value === 'string' && value) params.push(`${id}=${encodeURIComponent(value)}`);
      }
      for (const [id, value] of Object.entries(filters)) {
        if (!id.startsWith('genre.')) continue;
        if (value === 'include') params.push(`include_genres%5B%5D=${encodeURIComponent(id.slice(6))}`);
        if (value === 'exclude') params.push(`exclude_genres%5B%5D=${encodeURIComponent(id.slice(6))}`);
      }
      return listing(`${paged('/advanced-search', page)}${params.length ? `?${params.join('&')}` : ''}`);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const author =
        document.selectFirst("span:has(i[title='Tác Giả']) > span")?.text() ||
        document.selectFirst("span:has(i[title='Tác Giả'])")?.text() ||
        undefined;
      return {
        url: manga.url,
        title: document.selectFirst('h1')?.text() || manga.title,
        thumbnailUrl: imageOf(document.selectFirst('#ratingModalCover, #series-thumbnail img')) ?? manga.thumbnailUrl,
        author,
        genres: document.select('#genres-tags-container a[href]').map((a) => a.text()),
        status: statusOf(document.selectFirst("span:has(i[title='Trạng thái'])")?.text()),
        description: document.selectFirst('#synopsisText')?.text() || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      const parentId = document.selectFirst('input#post_manga_id')?.attr('value');
      if (!parentId) return [];
      const first = await chapterPage(parentId, 1);
      if (!first) return [];
      const total = Math.max(
        1,
        ...[...(first.pagination ?? '').matchAll(/data-page="(\d+)"/g)].map((m) => Number(m[1]) || 1),
      );
      const pages = [first.html ?? ''];
      for (let page = 2; page <= total; page++) pages.push((await chapterPage(parentId, page))?.html ?? '');
      return pages.flatMap((markup) =>
        html
          .load(markup, { baseUrl: BASE_URL })
          .select('div.comic-card > a[href]')
          .map((a) => {
            const date = a.selectFirst('div.absolute.top-2.left-2 span, span.text-white')?.text();
            return {
              url: relativeUrl(a.absUrl('href') ?? ''),
              name: a.attr('title') || a.selectFirst('h3')?.text() || '',
              uploadedAt: relativeDateVi(date) ?? parseDate(date, 'dd/MM/yyyy'),
            };
          }),
      );
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      let images = document.select('main.webtoon-mode img.page-image');
      if (!images.length) images = document.select('#webtoonContainer img.page-image, #webtoonContainer img');
      return images
        .map((img) => imageOf(img) ?? '')
        .filter(Boolean)
        .map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[^?#]+?\.html)/i.exec(url.trim());
      if (!match || match[1]!.toLowerCase() !== hostOf(BASE_URL)) return null;
      const segments = match[2]!.split('/').filter(Boolean);
      const mangaSegments = segments.slice(0, segments.findIndex((s) => s.startsWith('chapter-')) >>> 0);
      const path = `/${(mangaSegments.length ? mangaSegments : segments).join('/')}`;
      return { url: path.endsWith('.html') ? path : `${path}.html`, title: '' };
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
