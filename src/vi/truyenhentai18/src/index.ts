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
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://truyenhentai18.net';
const headers = { 'User-Agent': USER_AGENT };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const pagedUrl = (path: string, page: number) => (page > 1 ? `${BASE_URL}${path}/page/${page}` : `${BASE_URL}${path}`);
const imageOf = (element: HtmlElement) =>
  element.attr('data-src') !== undefined ? element.absUrl('data-src') : element.absUrl('src');

function parseMangaPage(document: HtmlElement): MangaPage {
  const items = document.select('div.col-6.col-md-4.col-lg-2.mb-3').flatMap((element): MangaSummary[] => {
    const link = element.selectFirst('a');
    const img = element.selectFirst('img');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: element.selectFirst('h2')?.text() ?? '',
        thumbnailUrl: img ? imageOf(img) || undefined : undefined,
      },
    ];
  });
  return { items, hasNextPage: selectIgnoreCase(document, 'ul.pagination li a:contains(»)').length > 0 };
}

function parseRelativeDate(value?: string): number | undefined {
  const text = value?.split('•').pop()?.trim().toLowerCase();
  if (!text || !text.includes('trước')) return undefined;
  const amount = Number.parseInt(/\d+/.exec(text)?.[0] ?? '', 10);
  if (Number.isNaN(amount)) return undefined;
  const units: [string[], number][] = [
    [['giây'], 1000],
    [['phút'], 60_000],
    [['giờ', 'tiếng'], 3_600_000],
    [['ngày'], 86_400_000],
    [['tuần'], 7 * 86_400_000],
    [['tháng'], 30 * 86_400_000],
    [['năm'], 365 * 86_400_000],
  ];
  const unit = units.find(([names]) => names.some((n) => text.includes(n)));
  return unit ? Date.now() - amount * unit[1] : undefined;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => parseMangaPage(await load(pagedUrl('/xem-nhieu-nhat', page))),
    getLatest: async (page) => parseMangaPage(await load(pagedUrl('/moi-cap-nhat', page))),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const genre = typeof filters.genre === 'string' ? filters.genre : '';
      const url =
        !query.trim() && genre
          ? pagedUrl(`/category/${genre}`, page)
          : `${pagedUrl('', page)}${page > 1 ? '' : '/'}?s=${encodeURIComponent(query.trim())}`.replace('//?', '/?');
      return parseMangaPage(await load(url));
    },
    async getFilters(): Promise<Filter[]> {
      try {
        const document = await load(BASE_URL);
        const menu = document.selectFirst('#categoryDropdown + *');
        const seen = new Set<string>();
        const genres = (menu?.select('a[href*=/category/]') ?? []).flatMap((link) => {
          const label = link.text();
          const slug = /\/category\/([^/?#]+)/.exec(link.absUrl('href') || link.attr('href') || '')?.[1];
          if (!label || !slug || seen.has(slug)) return [];
          seen.add(slug);
          return [{ label, value: slug }];
        });
        return genres.length
          ? [
              { type: 'header', label: 'Lưu ý: Bộ lọc thể loại chỉ hoạt động khi ô tìm kiếm trống' },
              {
                type: 'select',
                id: 'genre',
                label: 'Thể loại',
                options: [{ label: 'Tất cả', value: '' }, ...genres],
                default: '',
              },
            ]
          : [];
      } catch (error) {
        log.warn('Cannot load genres', error);
        return [];
      }
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      let status: MangaStatus = 'unknown';
      let author: string | undefined;
      for (const element of document.select('.list-group-item, div')) {
        const text = element.text();
        const lower = text.toLowerCase();
        if (lower.includes('trạng thái:')) {
          status = lower.includes('hoàn thành')
            ? 'completed'
            : lower.includes('đang tiến hành')
              ? 'ongoing'
              : 'unknown';
        } else if (lower.includes('tác giả:')) author = text.slice(text.indexOf(':') + 1).trim();
      }
      return {
        url: manga.url,
        title: document.selectFirst('h1')?.text() || manga.title,
        thumbnailUrl:
          document.selectFirst('img.manga-cover')?.absUrl('src') ||
          document.selectFirst('.card img.img-fluid')?.absUrl('src') ||
          manga.thumbnailUrl,
        genres: document.select('a.badge.bg-primary').map((a) => a.text()),
        status,
        author,
        description:
          document
            .select('.description')
            .map((e) => e.text().trim())
            .join('\n') || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      return document.select('div.chapter-item').flatMap((element): Chapter[] => {
        const link = element.selectFirst('a.fw-bold');
        if (!link) return [];
        return [
          {
            url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
            name: link.text(),
            uploadedAt: parseRelativeDate(element.selectFirst('div.chapter-date')?.text()),
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(absoluteUrl(BASE_URL, chapter.url));
      return document
        .select('div#viewer.chapter-container img')
        .map((img, index) => ({ index, imageUrl: imageOf(img) }));
    },
    imageHeaders: () => ({ ...headers, Referer: `${BASE_URL}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[^/?#]+\.html)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
