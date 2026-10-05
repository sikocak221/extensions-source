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

const BASE_URL = 'https://thohamngu.xyz';
const VIETNAM_OFFSET = 7 * 3_600_000;
const headers = { 'User-Agent': USER_AGENT };
const SMALL_THUMBNAIL_REGEX = /-150x150(\.[a-zA-Z]+)$/;

interface FilterOption {
  label: string;
  value: string;
}

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function lazyImage(element: HtmlElement | null | undefined): string | undefined {
  if (!element) return undefined;
  const lazy = element.absUrl('data-lazy-src');
  const src = element.absUrl('src');
  const url = lazy || (src && !src.startsWith('data:') ? src : '');
  return url ? url.replace(SMALL_THUMBNAIL_REGEX, '$1') : undefined;
}

function listItems(document: HtmlElement): MangaSummary[] {
  return document.select('ul.single-list-comic li.position-relative').flatMap((element): MangaSummary[] => {
    const link = element.selectFirst('p.super-title a');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: link.text(),
        thumbnailUrl: lazyImage(element.selectFirst('img.list-left-img')),
      },
    ];
  });
}

function parseLatestPage(document: HtmlElement): MangaPage {
  const items = document
    .select('.col-md-3.col-xs-6.comic-item')
    .filter((e) => (e.selectFirst('a')?.absUrl('href') ?? '').includes('/truyen/'))
    .flatMap((element): MangaSummary[] => {
      const title = element.selectFirst('h3.comic-title');
      const link = element.select('a').find((a) => a.selectFirst('h3.comic-title') !== null);
      if (!title || !link) return [];
      return [
        {
          url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
          title: title.text(),
          thumbnailUrl: lazyImage(element.selectFirst('img')),
        },
      ];
    });
  return { items, hasNextPage: document.selectFirst('ul.pager li.next:not(.disabled) a') !== null };
}

function parseStatus(status: string): MangaStatus {
  const value = status.toLowerCase();
  if (value.includes('đang tiến hành')) return 'ongoing';
  if (value.includes('hoàn thành') || value.includes('trọn bộ')) return 'completed';
  return 'unknown';
}

const pathOf = (document: HtmlElement, selector: string): FilterOption[] => {
  const seen = new Set<string>();
  return document.select(`${selector} a[href]`).flatMap((a) => {
    const label = a.text();
    const value = relativeUrl(a.absUrl('href') || a.attr('href') || '');
    if (!label || seen.has(value)) return [];
    seen.add(value);
    return [{ label, value }];
  });
};

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      return { items: listItems(await load(`${BASE_URL}/nhieu-xem-nhat/`)), hasNextPage: false };
    },
    async getLatest(page: number): Promise<MangaPage> {
      return parseLatestPage(await load(page === 1 ? BASE_URL : `${BASE_URL}/page/${page}/`));
    },
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) {
        const response = await http.post<{
          success: boolean;
          data: { title: string; link: string; img?: string | null }[];
        }>(
          `${BASE_URL}/wp-admin/admin-ajax.php`,
          { form: { action: 'searchtax', keyword: query.trim() } },
          { headers, responseType: 'json' },
        );
        const seen = new Set<string>();
        const items = response.body.data
          .filter((r) => r.link.includes('/truyen/'))
          .map((r): MangaSummary => ({
            url: relativeUrl(r.link),
            title: r.title,
            thumbnailUrl: r.img?.replace(SMALL_THUMBNAIL_REGEX, '$1'),
          }))
          .filter((m) => !seen.has(m.url) && seen.add(m.url));
        return { items, hasNextPage: false };
      }
      const path = ['genre', 'group', 'series', 'keyword']
        .map((id) => filters[id])
        .find((value) => typeof value === 'string' && value);
      if (typeof path === 'string') {
        const document = await load(absoluteUrl(BASE_URL, path));
        const items = listItems(document);
        return items.length ? { items, hasNextPage: false } : parseLatestPage(document);
      }
      return this.getLatest!(page);
    },
    async getFilters(): Promise<Filter[]> {
      try {
        const document = await load(BASE_URL);
        const select = (id: string, label: string, options: FilterOption[]): Filter[] =>
          options.length
            ? [{ type: 'select', id, label, options: [{ label: 'Tất cả', value: '' }, ...options], default: '' }]
            : [];
        return [
          { type: 'header', label: 'Bộ lọc sẽ bị bỏ qua khi tìm kiếm' },
          ...select('genre', 'Thể loại', pathOf(document, '#nav-tags')),
          ...select('group', 'Nhóm', pathOf(document, '#nav-teams')),
          ...select('series', 'Loạt Truyện', pathOf(document, '#nav-series')),
          ...select('keyword', 'Từ khóa', pathOf(document, '#nav-hashtags')),
        ];
      } catch (error) {
        log.warn('Cannot load filters', error);
        return [];
      }
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      return {
        url: manga.url,
        title: document.selectFirst('h2.info-title')?.text() || manga.title,
        thumbnailUrl: lazyImage(document.selectFirst('div.col-sm-4 img.img-thumbnail')) ?? manga.thumbnailUrl,
        author: selectIgnoreCase(document, 'strong:contains(Tác giả) + span')[0]?.text() || undefined,
        status: parseStatus(document.selectFirst('span.comic-stt')?.text() ?? ''),
        genres: document.select('a[href*=/the-loai/]').map((a) => a.text()),
        description: document.selectFirst('div.text-justify')?.text() || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      return document.select('.table-scroll table tr').flatMap((row): Chapter[] => {
        const link = row.selectFirst('a.text-capitalize');
        if (!link) return [];
        const raw = link.text();
        const match = /Chap\s*\d+(\.\d+)?/i.exec(raw);
        const name = match ? match[0].trim() : raw.split('–').pop()!.split('-').pop()!.trim();
        const date = parseDate(row.selectFirst('td.hidden-xs.hidden-sm')?.text(), 'dd/MM/yy');
        return [
          {
            url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
            name,
            uploadedAt: date === undefined ? undefined : date - VIETNAM_OFFSET,
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(absoluteUrl(BASE_URL, chapter.url));
      const root = document.selectFirst('#view-chapter') ?? document;
      const seen = new Set<string>();
      return root
        .select('img')
        .flatMap((img): string[] => {
          const lazy = img.attr('data-lazy-src') ?? '';
          if (lazy.startsWith('http')) return [lazy];
          const src = img.absUrl('src') ?? '';
          return src.startsWith('http') ? [src] : [];
        })
        .filter((url) => !seen.has(url) && seen.add(url))
        .map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => ({ ...headers, Referer: `${BASE_URL}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/truyen\/[^/?#]+\/?)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
