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

const BASE_URL = 'https://truyenhentaivn.store';
const VIETNAM_OFFSET = 7 * 3_600_000;
const headers = { 'User-Agent': USER_AGENT };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const listUrl = (path: string, page: number) => `${BASE_URL}${path}?page=${page}`;

function mangaFromElement(element: HtmlElement): MangaSummary | null {
  const link = element.selectFirst('a.name');
  if (!link) return null;
  return {
    url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
    title: link.attr('title') || link.text(),
    thumbnailUrl: element.selectFirst('a.s-thumb img')?.absUrl('src') || undefined,
  };
}

function parseList(document: HtmlElement): MangaPage {
  return {
    items: document.select('div.entry.text-center').flatMap((e) => mangaFromElement(e) ?? []),
    hasNextPage: document.selectFirst('.z-pagination a.page-numbers[title=Next]') !== null,
  };
}

function parseStatus(text?: string): MangaStatus {
  const value = text?.toLowerCase() ?? '';
  if (value.includes('hoàn thành')) return 'completed';
  if (value.includes('đang tiến hành') || value.includes('đang cập nhật')) return 'ongoing';
  if (['tạm ngưng', 'tạm dừng', 'hiatus'].some((s) => value.includes(s))) return 'hiatus';
  return 'unknown';
}

const imageSrc = (img: HtmlElement) => img.absUrl('data-src') || img.absUrl('src') || '';

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => parseList(await load(listUrl('/top-de-cu', page))),
    getLatest: async (page) => parseList(await load(listUrl('/danh-sach', page))),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const genre = typeof filters.genre === 'string' && filters.genre ? filters.genre : undefined;
      const url = query.trim()
        ? `${BASE_URL}/tim-kiem-truyen/?q=${encodeURIComponent(query.trim())}&page=${page}`
        : listUrl(genre ?? '/danh-sach', page);
      return parseList(await load(url));
    },
    async getFilters(): Promise<Filter[]> {
      try {
        const document = await load(BASE_URL);
        const seen = new Set<string>();
        const genres = document
          .select('li:has(> a[href="/the-loai-truyen/"]) ul.sub-menu a[href^="/the-loai-"]')
          .flatMap((link) => {
            const label = link.text();
            const value = relativeUrl(link.absUrl('href') || link.attr('href') || '');
            if (!label || seen.has(value)) return [];
            seen.add(value);
            return [{ label, value }];
          });
        return genres.length
          ? [
              { type: 'header', label: 'Lưu ý: Bộ lọc thể loại chỉ hoạt động khi ô tìm kiếm trống' },
              { type: 'select', id: 'genre', label: 'Thể loại', options: genres, default: genres[0]!.value },
            ]
          : [];
      } catch (error) {
        log.warn('Cannot load genres', error);
        return [];
      }
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      const statusRow = document.select('.tsinfo .imptdt').find((e) => e.text().includes('Tình trạng'));
      return {
        url: manga.url,
        title: document.selectFirst('.comic-info .info h1.name')?.text() || manga.title,
        author: document.selectFirst('.meta-data .author i')?.text() || undefined,
        genres: document.select('.meta-data .genre a').map((a) => a.text()),
        description: document.selectFirst('.comic-description .inner')?.text() || undefined,
        status: parseStatus(statusRow?.selectFirst('i')?.text()),
        thumbnailUrl: document.selectFirst('.comic-info .book img')?.absUrl('src') || manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      return document.select('.chap-list a.d-flex.justify-content-between').flatMap((element): Chapter[] => {
        const name = element.selectFirst('span.name')?.text();
        if (!name) return [];
        const date = parseDate(element.select('span')[1]?.text(), 'dd-MM-yyyy');
        return [
          {
            url: relativeUrl(element.absUrl('href') || element.attr('href') || ''),
            name,
            uploadedAt: date === undefined ? undefined : date - VIETNAM_OFFSET,
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(absoluteUrl(BASE_URL, chapter.url));
      const valid = (selector: string) =>
        document
          .select(selector)
          .map(imageSrc)
          .filter((url) => url && !url.startsWith('data:'));
      const urls = valid('.chapter-content img');
      return [...new Set(urls.length ? urls : valid('.content-text img'))].map((imageUrl, index) => ({
        index,
        imageUrl,
      }));
    },
    imageHeaders: () => ({ ...headers, Referer: `${BASE_URL}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/\d+-doc-truyen-[^?#]+\.html)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
