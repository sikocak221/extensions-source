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

const BASE_URL = 'https://truyenhentaiz.net';
const VIETNAM_OFFSET = 7 * 3_600_000;
const headers = { 'User-Agent': USER_AGENT };

async function load(url: string): Promise<{ document: HtmlElement; url: string }> {
  const response = await http.get(url, { headers });
  return { document: html.load(response.body, { baseUrl: response.url }), url: response.url };
}

const pagedUrl = (path: string, page: number) => (page > 1 ? `${BASE_URL}${path}/page/${page}` : `${BASE_URL}${path}`);
const imageUrl = (element: HtmlElement) => element.absUrl('src') || element.absUrl('data-src') || undefined;

function mangaFromElement(element: HtmlElement): MangaSummary | null {
  const link = element.selectFirst('div.card-manga-body > a[href]');
  if (!link) return null;
  return {
    url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
    title: link.selectFirst('h2.card-manga-title')?.text() ?? '',
    thumbnailUrl: imageUrl(element.selectFirst('img.card-img-top') ?? element),
  };
}

async function parseList(url: string): Promise<MangaPage> {
  const { document, url: finalUrl } = await load(url);
  const segments = finalUrl.split('?')[0]!.split('/');
  const current = Number.parseInt(segments[segments.indexOf('page') + 1] ?? '', 10) || 1;
  return {
    items: document.select('section.container-box-manga .card.card-manga').flatMap((e) => mangaFromElement(e) ?? []),
    hasNextPage: document.selectFirst(`.pagination a.page-link[data-page="${current + 1}"]`) !== null,
  };
}

function parseStatus(text?: string): MangaStatus {
  const value = text?.toLowerCase() ?? '';
  if (value.includes('đang tiến hành') || value.includes('đang cập nhật')) return 'ongoing';
  if (value.includes('hoàn thành')) return 'completed';
  if (value.includes('tạm ngưng') || value.includes('tạm dừng')) return 'hiatus';
  return 'unknown';
}

function relativeDate(text: string): number | undefined {
  if (text === 'mới' || text.includes('vừa xong')) return Date.now();
  const amount = Number.parseInt(/\d+/.exec(text)?.[0] ?? '', 10);
  if (Number.isNaN(amount)) return undefined;
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

function parseChapterDate(text?: string): number | undefined {
  if (!text?.trim()) return undefined;
  const normalized = text.replace(/\s+/g, ' ').trim();
  const relative = relativeDate(normalized.toLowerCase());
  if (relative !== undefined) return relative;
  const time = parseDate(normalized, 'HH:mm dd-MM-yyyy') ?? parseDate(normalized, 'dd-MM-yyyy');
  return time === undefined ? undefined : time - VIETNAM_OFFSET;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => parseList(pagedUrl('/xem-nhieu-nhat', page)),
    getLatest: (page) => parseList(pagedUrl('/moi-cap-nhat', page)),
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim())
        return parseList(`${BASE_URL}${page > 1 ? `/page/${page}` : ''}?s=${encodeURIComponent(query.trim())}`);
      const genre = typeof filters.genre === 'string' && filters.genre ? filters.genre : undefined;
      return parseList(genre ? pagedUrl(`/category/${genre}`, page) : pagedUrl('/xem-nhieu-nhat', page));
    },
    async getFilters(): Promise<Filter[]> {
      try {
        const { document } = await load(BASE_URL);
        const seen = new Set<string>();
        const genres = selectIgnoreCase(
          document,
          '#sidebar > ul.sidebar-nav > li.nav-item:has(> a:contains(Thể loại)) a[href*=/category/]',
        ).flatMap((link) => {
          const label = link.text();
          const slug = /\/category\/([^/?#]+)/.exec(link.absUrl('href') || link.attr('href') || '')?.[1];
          if (!label || !slug || seen.has(slug)) return [];
          seen.add(slug);
          return [{ label, value: slug }];
        });
        return genres.length
          ? [
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
      const { document } = await load(absoluteUrl(BASE_URL, manga.url));
      const info = document.selectFirst('.card.mb-3 .manga-info');
      return {
        url: manga.url,
        title: document.selectFirst('.card.mb-3 h3.card-title, .pagetitle h1')?.text() || manga.title,
        thumbnailUrl:
          imageUrl(document.selectFirst('.card.mb-3 img.single-thumbnail, .card.mb-3 img') ?? document) ??
          manga.thumbnailUrl,
        status: parseStatus(info ? selectIgnoreCase(info, 'span:contains(Status:) strong')[0]?.text() : undefined),
        genres: info?.select('.categories a').map((a) => a.text()),
        description: document.selectFirst('.card.mb-3 p.desc')?.text() || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { document } = await load(absoluteUrl(BASE_URL, manga.url));
      let rows = selectIgnoreCase(
        document,
        'div.card:has(h2.card-title:contains(Chapters)) li.list-group-item:has(a[href])',
      );
      if (rows.length === 0) rows = document.select('li.list-group-item:has(a[href*=/chapter-])');
      return rows.flatMap((element): Chapter[] => {
        const link = element.selectFirst('a[href]');
        if (!link) return [];
        return [
          {
            url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
            name: link.selectFirst('span.fw-bold')?.text() || link.text(),
            uploadedAt: parseChapterDate(element.selectFirst('em')?.text()),
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document } = await load(absoluteUrl(BASE_URL, chapter.url));
      const pick = (selector: string) =>
        document
          .select(selector)
          .map(imageUrl)
          .filter((url): url is string => !!url && !url.startsWith('data:') && !url.endsWith('/bn.png'));
      let urls = pick('#chapter-content img[src], #chapter-content img[data-src]');
      if (urls.length === 0) urls = pick('#chapter-content img, .chapter-content img');
      return [...new Set(urls)].map((url, index) => ({ index, imageUrl: url }));
    },
    imageHeaders: () => ({ ...headers, Referer: `${BASE_URL}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[^/?#]+\.html)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
