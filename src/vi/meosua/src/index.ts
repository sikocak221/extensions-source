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

const BASE_URL = 'https://meosua.org';
const VIETNAM_OFFSET = 7 * 3_600_000;
const headers = { 'User-Agent': USER_AGENT };
const LOCKED_MESSAGE = 'Vui lòng đăng nhập vào tài khoản phù hợp bằng webview để xem chương này';
const PLACEHOLDER_IMAGE = /\/wp-content\/uploads\/\d{4}\/\d{2}\/(?:0|999)\.webp$/i;
const CARD = 'article.uk-panel.uk-margin-small-bottom:has(h3 a[href*="/truyen/"])';

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const imageOf = (element: HtmlElement | null | undefined) =>
  element?.absUrl('data-src') || element?.absUrl('data-lazy-src') || element?.absUrl('src') || undefined;

function mangaFromElement(element: HtmlElement): MangaSummary | null {
  const link = element.selectFirst('h3 a[href*="/truyen/"]');
  if (!link) return null;
  return {
    url: relativeUrl((link.absUrl('href') || link.attr('href') || '').split('?')[0]!),
    title: link.text(),
    thumbnailUrl: imageOf(element.selectFirst('img')),
  };
}

function parseList(document: HtmlElement, paged = true): MangaPage {
  const seen = new Set<string>();
  const items = document
    .select(CARD)
    .flatMap((e) => mangaFromElement(e) ?? [])
    .filter((m) => !seen.has(m.url) && seen.add(m.url));
  return { items, hasNextPage: paged && document.selectFirst('.uk-pagination [uk-pagination-next]') !== null };
}

function parseStatus(text: string): MangaStatus {
  const value = text.toLowerCase();
  if (value.includes('trọn bộ')) return 'completed';
  if (value.includes('đang tiến hành')) return 'ongoing';
  return 'unknown';
}

const chapterRow = (document: HtmlElement) =>
  document.select('#chapter-list-tab .chapter-item, .tab-story .chapter-list .chapter-item');

function chapterFromElement(element: HtmlElement): Chapter | null {
  const link = element.selectFirst('a.uk-link-toggle');
  const url = link?.absUrl('href');
  const raw = link?.selectFirst('h4')?.text();
  if (!link || !url || !raw) return null;
  const name = /chap\s*\d+(?:\.\d+)?/i.exec(raw)?.[0].replace(/chap/i, 'Chap').replace(/\s+/g, ' ') ?? raw;
  const locked = element.selectFirst('[uk-icon="icon: lock"], .uk-text-danger[uk-icon]') !== null;
  const date = parseDate(
    element.selectFirst('.uk-article-meta [uk-icon="icon: calendar"] + span')?.text(),
    'dd/MM/yyyy',
  );
  return {
    url: relativeUrl(url),
    name: locked ? `🔒 ${name}` : name,
    uploadedAt: date === undefined ? undefined : date - VIETNAM_OFFSET,
  };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => parseList(await load(`${BASE_URL}/xem-nhieu-nhat/?trang=${page}`)),
    getLatest: async (page) => parseList(await load(`${BASE_URL}/truyen-moi-cap-nhat/?trang=${page}`)),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) return parseList(await load(`${BASE_URL}/?s=${encodeURIComponent(query.trim())}`), false);
      const genre = typeof filters.genre === 'string' && filters.genre ? filters.genre : undefined;
      return parseList(
        await load(genre ? `${BASE_URL}${genre}?trang=${page}` : `${BASE_URL}/truyen-moi-cap-nhat/?trang=${page}`),
      );
    },
    async getFilters(): Promise<Filter[]> {
      try {
        const document = await load(`${BASE_URL}/the-loai/`);
        const seen = new Set<string>();
        const genres = document
          .select('a.uk-button[href*="/the-loai/"]:not(.uk-disabled)')
          .flatMap((link) => {
            const value = relativeUrl(link.absUrl('href') || link.attr('href') || '');
            if (seen.has(value)) return [];
            seen.add(value);
            return [{ label: link.text(), value }];
          })
          .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
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
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      // The status is the text after the "file-edit" icon.
      const statusText =
        document
          .select('.tab-story div')
          .find((e) => e.html().includes('icon: file-edit') && !e.html().includes('<div'))
          ?.text() ?? '';
      const summary = document.selectFirst('.tab-story .hide-long-text p')?.text();
      return {
        url: manga.url,
        title:
          document
            .selectFirst(
              'h2#category-title, section#single-block h2, #single-block h2.uk-margin-remove-top, h2.uk-margin-remove-top',
            )
            ?.text() || manga.title,
        thumbnailUrl: document.selectFirst('.single-thumb img')?.absUrl('src') || manga.thumbnailUrl,
        status: parseStatus(statusText),
        genres: document.select('.tab-story a[href*="/the-loai/"]').map((a) => a.text()),
        description:
          summary || selectIgnoreCase(document, '.tab-story h3:contains(Tóm tắt) + p')[0]?.text() || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const base = absoluteUrl(BASE_URL, manga.url);
      const first = await load(base);
      const chapters = chapterRow(first).flatMap((e) => chapterFromElement(e) ?? []);
      const pages = first
        .select('#chapter-list-tab .uk-pagination a[href*="?trang="]')
        .map((a) => Number.parseInt(/[?&]trang=(\d+)/.exec(a.absUrl('href') || a.attr('href') || '')?.[1] ?? '', 10))
        .filter((n) => !Number.isNaN(n));
      const lastPage = Math.max(1, ...pages);
      for (let page = 2; page <= lastPage; page++) {
        const next = await load(`${base.split('?')[0]}?trang=${page}`);
        chapters.push(...chapterRow(next).flatMap((e) => chapterFromElement(e) ?? []));
      }
      const seen = new Set<string>();
      return chapters.filter((c) => !seen.has(c.url) && seen.add(c.url));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(absoluteUrl(BASE_URL, chapter.url));
      if (document.selectFirst('#view-chapter .lock-card, #view-chapter #unlock-chapter, #view-chapter #xu-lock'))
        throw new Error(LOCKED_MESSAGE);
      let images = document.select('#view-chapter .chapter-content img');
      if (images.length === 0) images = document.select('.chapter-content img, .view-comic img');
      return images
        .map(imageOf)
        .filter((url): url is string => !!url && !PLACEHOLDER_IMAGE.test(url))
        .map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => ({ ...headers, Referer: `${BASE_URL}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/truyen\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/truyen/${match[2]}/`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
