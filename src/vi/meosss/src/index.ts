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

const BASE_URL = 'https://meosss.com';
const headers = { 'User-Agent': USER_AGENT };
const NEXT_PAGE = ".uk-pagination a[aria-label='Trang sau'][href]";
const MANGA_URL_REGEX = /\/truyen\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/;

const STATUSES: [string, string][] = [
  ['Tất cả', ''],
  ['Đang tiến hành', 'ongoing'],
  ['Kết thúc mùa', 'season_end'],
  ['Trọn bộ', 'completed'],
  ['Nguồn tạm ngưng', 'source_hiatus'],
  ['Đã theo kịp', 'caught_up'],
  ['Bị hủy', 'dropped'],
];
const AGES: [string, string][] = [
  ['Tất cả', ''],
  ['Mọi lứa tuổi', 'all'],
  ['13+', '13+'],
  ['16+', '16+'],
  ['18+', '18+'],
];
const SORTS: [string, string][] = [
  ['Mới cập nhật', 'updated'],
  ['Mới nhất', 'new'],
  ['Cũ nhất', 'old'],
  ['Nhiều lượt xem nhất', 'views'],
  ['Lượt xem hôm nay', 'views_day'],
  ['Lượt xem tuần này', 'views_week'],
  ['Lượt xem tháng này', 'views_month'],
  ['Đánh giá cao nhất', 'rating'],
  ['Opal nhiều nhất', 'power'],
  ['Nhiều người theo dõi nhất', 'follow'],
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const imgUrl = (img: HtmlElement | null | undefined) => img?.attr('src') || undefined;

function mangaFromDetails(element: HtmlElement): MangaSummary | null {
  const link = element.selectFirst('a[href*=/truyen/]');
  const title = element.selectFirst('h2.uk-text-bold a')?.text();
  if (!link || !title) return null;
  return {
    url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
    title,
    thumbnailUrl: imgUrl(element.selectFirst('img')),
  };
}

const pagePath = (base: string, page: number) => `${BASE_URL}${base}${page > 1 ? `page/${page}/` : ''}`;

function select(id: string, label: string, list: [string, string][], fallback: string): Filter {
  return {
    type: 'select',
    id,
    label,
    options: list.map(([text, value]) => ({ label: text, value })),
    default: fallback,
  };
}

function parseStatus(status?: string): MangaStatus {
  switch (status?.toLowerCase()) {
    case 'đang tiến hành':
    case 'đã theo kịp':
      return 'ongoing';
    case 'trọn bộ':
      return 'completed';
    case 'kết thúc mùa':
    case 'nguồn tạm ngưng':
      return 'hiatus';
    case 'bị hủy':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const document = await load(`${BASE_URL}/dang-thinh-hanh/`);
      return {
        items: document.select('.manga-item-details').flatMap((e) => mangaFromDetails(e) ?? []),
        hasNextPage: false,
      };
    },
    async getLatest(page: number): Promise<MangaPage> {
      const document = await load(pagePath('/moi-cap-nhat/', page));
      const items = document.select('.manga-item-grid').flatMap((e) => mangaFromDetails(e) ?? []);
      return { items, hasNextPage: document.selectFirst(NEXT_PAGE) !== null };
    },
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      let url: string;
      if (query.trim()) url = `${pagePath('/', page)}?s=${encodeURIComponent(query.trim())}`;
      else {
        const params: [string, string][] = [];
        for (const [id, value] of Object.entries(filters))
          if (id.startsWith('genre.') && value === true) params.push(['genre[]', id.slice(6)]);
        for (const [id, param] of [
          ['status', 'status'],
          ['age', 'age_rating'],
        ] as const) {
          const value = filters[id];
          if (typeof value === 'string' && value) params.push([param, value]);
        }
        params.push(['sort', typeof filters.sort === 'string' && filters.sort ? filters.sort : 'updated']);
        url = `${pagePath('/bo-loc-nang-cao/', page)}?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
      }
      const document = await load(url);
      const hasNextPage = document.selectFirst(NEXT_PAGE) !== null;
      if (document.selectFirst('.manga-filter-form'))
        return { items: document.select('.manga-item-details').flatMap((e) => mangaFromDetails(e) ?? []), hasNextPage };
      const items = document.select('article').flatMap((article): MangaSummary[] => {
        const link = article.selectFirst('h2 a[href*=/truyen/]');
        const href = link?.absUrl('href') ?? '';
        if (!link || !MANGA_URL_REGEX.test(href)) return [];
        return [{ url: relativeUrl(href), title: link.text(), thumbnailUrl: imgUrl(article.selectFirst('img')) }];
      });
      return { items, hasNextPage };
    },
    async getFilters(): Promise<Filter[]> {
      const filters: Filter[] = [];
      try {
        const document = await load(`${BASE_URL}/bo-loc-nang-cao/`);
        const genres = document
          .select('input[name="genre[]"]')
          .map((input) => ({
            label: input.attr('data-genre-name') || input.attr('value') || '',
            value: input.attr('value') ?? '',
          }))
          .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
        if (genres.length)
          filters.push({
            type: 'group',
            id: 'genres',
            label: 'Thể loại',
            filters: genres.map((g): Filter => ({ type: 'checkbox', id: `genre.${g.value}`, label: g.label })),
          });
      } catch (error) {
        log.warn('Cannot load genres', error);
      }
      filters.push(
        select('status', 'Tình trạng', STATUSES, ''),
        select('age', 'Độ tuổi', AGES, ''),
        select('sort', 'Sắp xếp', SORTS, 'updated'),
      );
      return filters;
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      return {
        url: manga.url,
        title: document.selectFirst('#manga-title')?.text() || manga.title,
        author: document.selectFirst('.manga-info-details a[href*=/tac-gia/]')?.text() || undefined,
        description: document.selectFirst('#manga-description')?.text() || undefined,
        genres: document.select('.manga-block a[href*=/the-loai/]').map((a) => a.text()),
        status: parseStatus(document.selectFirst('#manga-status')?.text()),
        thumbnailUrl: imgUrl(document.selectFirst('.story-cover img')) ?? manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const base = absoluteUrl(BASE_URL, manga.url).replace(/\/$/, '');
      const chapters: Chapter[] = [];
      for (let page = 1; ; page++) {
        const document = await load(`${base}/chap/page/${page}/`);
        const items = document.select('.chapter-item').flatMap((element): Chapter[] => {
          const a = element.selectFirst('a.uk-link-toggle');
          const heading = element.selectFirst('h3')?.text();
          if (!a || !heading) return [];
          const datetime = a.selectFirst('time[datetime]')?.attr('datetime');
          const time = datetime ? Date.parse(datetime) : Number.NaN;
          return [
            {
              url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
              name: heading.split('–').pop()!.trim(),
              uploadedAt: Number.isNaN(time) ? undefined : time,
            },
          ];
        });
        if (items.length === 0) break;
        chapters.push(...items);
        const hasNext = document
          .select('.uk-pagination a[href*="/chap/page/"]')
          .some((a) => Number.parseInt(a.text(), 10) > page);
        if (!hasNext) break;
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(absoluteUrl(BASE_URL, chapter.url));
      // Images of the ad blocks are not pages.
      return document
        .select('#chapter-content img')
        .filter((img) => img.select('.init-manga-chapter-ad').length === 0)
        .map((img, index) => ({ index, imageUrl: img.attr('data-original-src') || img.attr('src') || '' }));
    },
    imageHeaders: () => ({ ...headers, Referer: `${BASE_URL}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/truyen\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/truyen/${match[2]}/`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
