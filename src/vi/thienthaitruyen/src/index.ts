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
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://thienthaitruyen16.com';
const VIETNAM_OFFSET = 7 * 3_600_000;
const headers = { 'User-Agent': USER_AGENT };

const STATUSES = [
  ['all', 'All'],
  ['completed', 'Hoàn thành'],
  ['ongoing', 'Đang ra'],
  ['pending', 'Đang chờ xử lý'],
] as const;
const SORTS = [
  ['latest', 'Cập nhật gần đây'],
  ['rating', 'Xếp hạng'],
  ['bookmark', 'Số lượng đánh dấu'],
  ['name_asc', 'Tên (A-Z)'],
  ['name_desc', 'Tên (Z-A)'],
] as const;

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function mangaFromElement(element: HtmlElement): MangaSummary {
  return {
    url: relativeUrl(element.absUrl('href') || element.attr('href') || ''),
    title: element.selectFirst('span.line-clamp-2')?.text() ?? '',
    thumbnailUrl: element.selectFirst('img[src]')?.absUrl('src') || undefined,
  };
}

function parseMangaListPage(document: HtmlElement): MangaPage {
  const cards = (links: HtmlElement[]) => links.filter((a) => a.selectFirst('span.line-clamp-2') !== null);
  // The results follow the filter form; fall back to every card of the page.
  let elements = cards(document.select('a[href*=/truyen-tranh/]'));
  const narrowed = elements.filter((a) => a.selectFirst('img[src]') !== null);
  if (narrowed.length) elements = narrowed;
  const seen = new Set<string>();
  const items = elements.map(mangaFromElement).filter((m) => !seen.has(m.url) && seen.add(m.url));
  return { items, hasNextPage: document.select('a[href*=page=]').some((a) => a.text().includes('Sau')) };
}

async function mangaList(page: number, query: string, filters: FilterState): Promise<MangaPage> {
  const params: [string, string][] = [];
  if (query.trim()) params.push(['name', query.trim()]);
  for (const [id, value] of Object.entries(filters))
    if (id.startsWith('genre.') && value === true) params.push(['genres[]', id.slice(6)]);
  params.push(['status', typeof filters.status === 'string' ? filters.status : 'all']);
  params.push(['sort', typeof filters.sort === 'string' ? filters.sort : 'latest'], ['page', String(page)]);
  return parseMangaListPage(
    await load(`${BASE_URL}/tim-kiem-nang-cao?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`),
  );
}

function infoValue(document: HtmlElement, label: string): string | undefined {
  if (!document.select('p, h3').some((e) => e.text() === label)) return undefined;
  // The value is in the element next to the label.
  const siblings = selectIgnoreCase(document, `p:contains(${label}) + *, h3:contains(${label}) + *`);
  return siblings[0]?.text();
}

function parseStatus(status?: string): MangaStatus {
  const value = status?.toLowerCase() ?? '';
  if (value.includes('đang ra')) return 'ongoing';
  if (value.includes('hoàn thành')) return 'completed';
  return 'unknown';
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
    getPopular: (page) => mangaList(page, '', { status: 'all', sort: 'rating' }),
    getLatest: (page) => mangaList(page, '', { status: 'all', sort: 'latest' }),
    search: (query, page, filters) => mangaList(page, query, filters),
    async getFilters(): Promise<Filter[]> {
      const filters: Filter[] = [];
      try {
        const document = await load(`${BASE_URL}/tim-kiem-nang-cao`);
        const seen = new Set<string>();
        // Each checkbox sits in a label that carries its name.
        const genres = document.select('#genres-filter label').flatMap((label) => {
          const value = label.selectFirst("input[name='genres[]'][value]")?.attr('value');
          const text = label.text();
          if (!value || !text || seen.has(value)) return [];
          seen.add(value);
          return [{ label: text, value }];
        });
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
        {
          type: 'select',
          id: 'status',
          label: 'Trạng thái',
          options: STATUSES.map(([value, label]) => ({ value, label })),
          default: 'all',
        },
        {
          type: 'select',
          id: 'sort',
          label: 'Sắp xếp theo',
          options: SORTS.map(([value, label]) => ({ value, label })),
          default: 'latest',
        },
      );
      return filters;
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      const seen = new Set<string>();
      return {
        url: manga.url,
        title: document.selectFirst('h1')?.text() || manga.title,
        author: infoValue(document, 'Tác giả'),
        genres: selectIgnoreCase(document, 'h3:contains(Thể loại) + div a[href*=/the-loai/]')
          .map((a) => a.text())
          .filter((g) => !seen.has(g) && seen.add(g)),
        status: parseStatus(infoValue(document, 'Trạng thái')),
        description:
          document.selectFirst('p.comic-content.desk, p.comic-content.mobile, p.comic-content')?.text() || undefined,
        thumbnailUrl: document.selectFirst('img[alt=poster]')?.absUrl('src') || manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      return document
        .select('div.chapter-items > a.flex.justify-between.items-center.w-full')
        .flatMap((element): Chapter[] => {
          const url = element.absUrl('href');
          const name = element.selectFirst('p.text-sm.text-white.font-medium')?.text() || element.text();
          if (!url || !name) return [];
          const dateText = element.selectFirst('p.text-xs span')?.text();
          const absolute = parseDate(dateText, 'yyyy-MM-dd');
          return [
            {
              url: relativeUrl(url),
              name,
              uploadedAt: relativeDate(dateText) ?? (absolute === undefined ? undefined : absolute - VIETNAM_OFFSET),
            },
          ];
        });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(absoluteUrl(BASE_URL, chapter.url));
      let images = document.select('div.w-full.mx-auto.center img:not([title=banner])');
      if (images.length === 0) images = document.select('div.center img:not([title=banner])');
      return images
        .map((image) => image.absUrl('src'))
        .filter((url) => url && !url.includes('/banner/'))
        .map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => ({ ...headers, Referer: `${BASE_URL}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/truyen-tranh\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL)
        ? { url: `/truyen-tranh/${match[2]}`, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
