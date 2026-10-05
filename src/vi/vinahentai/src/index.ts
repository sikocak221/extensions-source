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

const BASE_URL = 'https://vinahentai.pics';
const MANGA_PER_PAGE = 24;
const headers = { 'User-Agent': USER_AGENT };
// The image subdomain has changed before: only the "/manga-images/" segment is stable.
const IMAGE_URL_REGEX = /https:\/\/[^"'\s\\]+\/manga-images\/[^"'\s\\]+/g;

const SORTS = [
  ['updatedAt', 'Mới cập nhật'],
  ['views', 'Xem nhiều'],
  ['likes', 'Đánh giá cao'],
  ['oldest', 'Cũ nhất'],
] as const;
const STATUSES = [
  ['', 'Tất cả'],
  ['ongoing', 'Đang tiến hành'],
  ['completed', 'Đã hoàn thành'],
] as const;

async function load(url: string): Promise<{ document: HtmlElement; url: string }> {
  const response = await http.get(url, { headers });
  return { document: html.load(response.body, { baseUrl: response.url }), url: response.url };
}

const qs = (params: [string, string][]) => params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

function parseMangaList(document: HtmlElement): MangaPage {
  const seen = new Set<string>();
  const items = document.select('.grid a[href*="/truyen-hentai/"]').flatMap((a): MangaSummary[] => {
    const url = relativeUrl(a.absUrl('href') || a.attr('href') || '');
    if (seen.has(url)) return [];
    seen.add(url);
    const titleDiv = a.selectFirst('div.truncate.font-semibold[title]');
    return [
      {
        url,
        title: titleDiv?.attr('title') || titleDiv?.text() || '',
        thumbnailUrl: a.selectFirst('img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: items.length >= MANGA_PER_PAGE };
}

function parseSearch(document: HtmlElement, finalUrl: string): MangaPage {
  const seen = new Set<string>();
  const items = document.select('a.group[href^="/truyen-hentai/"]').flatMap((a): MangaSummary[] => {
    const url = relativeUrl(a.absUrl('href') || a.attr('href') || '');
    const title = a.selectFirst('h2')?.text();
    if (!title || seen.has(url)) return [];
    seen.add(url);
    return [{ url, title, thumbnailUrl: a.selectFirst('img')?.absUrl('src') || undefined }];
  });
  const current = Number.parseInt(/page=(\d+)/.exec(finalUrl)?.[1] ?? '', 10) || 1;
  const max = Number.parseInt(document.selectFirst('input[type=number][max]')?.attr('max') ?? '', 10) || 1;
  const hasNext =
    document.select(`a[href*="page=${current + 1}"]`).length > 0 ||
    document.select(`button[title*="${current + 1}"]`).length > 0;
  return { items, hasNextPage: current < max || hasNext };
}

function relativeDate(text?: string): number | undefined {
  const amount = Number.parseInt(/\d+/.exec(text ?? '')?.[0] ?? '', 10);
  if (!text || Number.isNaN(amount)) return undefined;
  const units: [string, number][] = [
    ['giây', 1000],
    ['phút', 60_000],
    ['giờ', 3_600_000],
    ['ngày', 86_400_000],
    ['tuần', 7 * 86_400_000],
    ['tháng', 30 * 86_400_000],
    ['năm', 365 * 86_400_000],
  ];
  const unit = units.find(([name]) => text.includes(name));
  return unit ? Date.now() - amount * unit[1] : undefined;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) =>
      parseMangaList(
        (
          await load(
            `${BASE_URL}/danh-sach/?${qs([
              ['page', String(page)],
              ['sort', 'views'],
            ])}`,
          )
        ).document,
      ),
    getLatest: async (page) =>
      parseMangaList(
        (
          await load(
            `${BASE_URL}/danh-sach/?${qs([
              ['page', String(page)],
              ['sort', 'updatedAt'],
            ])}`,
          )
        ).document,
      ),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) {
        const { document, url } = await load(
          `${BASE_URL}/search?${qs([
            ['page', String(page)],
            ['q', query.trim()],
          ])}`,
        );
        return parseSearch(document, url);
      }
      const genre = typeof filters.genre === 'string' && filters.genre ? filters.genre : undefined;
      const sort = typeof filters.sort === 'string' && filters.sort ? filters.sort : 'updatedAt';
      const status = typeof filters.status === 'string' ? filters.status : '';
      const params: [string, string][] = [
        ['page', String(page)],
        ['sort', sort],
        ...(status ? [['status', status] as [string, string]] : []),
      ];
      return parseMangaList(
        (await load(`${BASE_URL}/${genre ? `genres/${genre}` : 'danh-sach'}?${qs(params)}`)).document,
      );
    },
    async getFilters(): Promise<Filter[]> {
      const filters: Filter[] = [];
      try {
        const { document } = await load(`${BASE_URL}/danh-sach`);
        const seen = new Set<string>();
        const genres = document
          .select('a[href*=/genres/]')
          .flatMap((a) => {
            const slug = (a.attr('href') ?? '').split('/genres/')[1]?.split('?')[0]?.split('/')[0] ?? '';
            const label = a.text().trim();
            if (!slug || !label || seen.has(slug)) return [];
            seen.add(slug);
            return [{ label, value: slug }];
          })
          .sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()));
        if (genres.length)
          filters.push({
            type: 'select',
            id: 'genre',
            label: 'Thể loại',
            options: [{ label: 'Tất cả', value: '' }, ...genres],
            default: '',
          });
      } catch (error) {
        log.warn('Cannot load genres', error);
      }
      filters.push(
        {
          type: 'select',
          id: 'sort',
          label: 'Sắp xếp theo',
          options: SORTS.map(([value, label]) => ({ value, label })),
          default: 'updatedAt',
        },
        {
          type: 'select',
          id: 'status',
          label: 'Tình trạng',
          options: STATUSES.map(([value, label]) => ({ value, label })),
          default: '',
        },
      );
      return filters;
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const response = await http.get(absoluteUrl(BASE_URL, manga.url), { headers });
      const document = html.load(response.body, { baseUrl: response.url });
      const names = (selector: string) =>
        document
          .select(selector)
          .map((a) => a.text())
          .filter((t) => !t.startsWith('+'));
      const status: MangaStatus = response.body.includes('Đang tiến hành')
        ? 'ongoing'
        : response.body.includes('Đã hoàn thành')
          ? 'completed'
          : 'unknown';
      return {
        url: manga.url,
        title: document.selectFirst('h1')?.text() || manga.title,
        author: names('a[href^="/authors/"]').join(', ') || undefined,
        genres: names('a[href^="/genres/"]'),
        thumbnailUrl:
          document.selectFirst('img[alt*=Bìa]')?.absUrl('src') ||
          document.selectFirst('img[src*=story-images]')?.absUrl('src') ||
          manga.thumbnailUrl,
        description: document.selectFirst('#manga-description-section .text-txt-secondary')?.text() || undefined,
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { document } = await load(absoluteUrl(BASE_URL, manga.url));
      const seen = new Set<string>();
      return document.select('a.block[href^="/truyen-hentai/"]').flatMap((a): Chapter[] => {
        const href = a.attr('href') ?? '';
        if (href.split('/').length - 1 <= 2 || seen.has(href)) return [];
        seen.add(href);
        return [
          {
            url: relativeUrl(href),
            name: a.selectFirst('span')?.text() || a.text(),
            uploadedAt: relativeDate(a.selectFirst('time')?.text()),
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.get(absoluteUrl(BASE_URL, chapter.url), { headers });
      const urls = [...new Set(response.body.match(IMAGE_URL_REGEX) ?? [])];
      return urls.map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => ({ ...headers, Referer: `${BASE_URL}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/truyen-hentai\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL)
        ? { url: `/truyen-hentai/${match[2]}`, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
