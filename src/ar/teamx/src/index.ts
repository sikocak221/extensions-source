import {
  type Chapter,
  type Filter,
  type FilterOption,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl } from './common/utils';

// The site moves now and then; urls are relative paths.
const BASE_URL = 'https://olympustaff.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const THUMBNAIL_SUFFIX = 'thumbnail_';
const NEXT_PAGE = 'a[rel=next]';

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const pageQuery = (page: number) => (page > 1 ? `?page=${page}` : '');

function parsePopular(document: HtmlElement): MangaPage {
  const items = document.select('div.listupd div.bsx').flatMap((element): MangaSummary[] => {
    const link = element.selectFirst('a');
    if (!link) return [];
    const img = element.selectFirst('img');
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: link.attr('title') ?? '',
        thumbnailUrl: img?.absUrl('data-src') || img?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst(NEXT_PAGE) !== null };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(page): Promise<MangaPage> {
      return parsePopular(await load(`/series/${pageQuery(page)}`));
    },
    async getLatest(page): Promise<MangaPage> {
      const document = await load(`/${pageQuery(page)}`);
      const items = document.select('div.last-chapter div.box').flatMap((element): MangaSummary[] => {
        const link = element.selectFirst('div.info a');
        const title = link?.selectFirst('h3')?.text();
        if (!link || !title) return [];
        return [
          {
            url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
            title,
            thumbnailUrl:
              element.selectFirst('div.imgu img')?.absUrl('src')?.replace(THUMBNAIL_SUFFIX, '') || undefined,
          },
        ];
      });
      return { items, hasNextPage: document.selectFirst(NEXT_PAGE) !== null };
    },
    async getFilters(): Promise<Filter[]> {
      const document = await load('/series');
      const options = (selector: string): FilterOption[] =>
        document.select(selector).map((o) => ({ label: o.text(), value: o.attr('value') ?? '' }));
      const select = (id: string, label: string, list: FilterOption[]): Filter[] =>
        list.length ? [{ type: 'select', id, label, options: list }] : [];
      return [
        { type: 'header', label: 'ملاحظة: تُهمل عوامل التصفية عند البحث' },
        { type: 'separator' },
        ...select('type', 'النوع', options('#select_type option')),
        ...select('status', 'الحالة', options('#select_state option')),
        ...select('genre', 'التصنيفات', options('#select_genre option')),
      ];
    },
    async search(query, page, filters): Promise<MangaPage> {
      if (query.trim()) {
        const document = await load(`/search?keyword=${encodeURIComponent(query)}`);
        const items = document.select('div.tx-grid a.tx-card').flatMap((element): MangaSummary[] => {
          const title = element.selectFirst('h3')?.text();
          if (!title) return [];
          return [
            {
              url: relativeUrl(element.absUrl('href') || element.attr('href') || ''),
              title,
              thumbnailUrl: element.selectFirst('img')?.absUrl('src')?.replace(THUMBNAIL_SUFFIX, '') || undefined,
            },
          ];
        });
        return { items, hasNextPage: false };
      }
      const params = (['type', 'status', 'genre'] as const)
        .filter((id) => typeof filters[id] === 'string' && filters[id])
        .map((id) => `${id}=${encodeURIComponent(filters[id] as string)}`);
      if (page > 1) params.push(`page=${page}`);
      return parsePopular(await load(`/series${params.length ? `?${params.join('&')}` : ''}`));
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const statusText = document.selectFirst('.full-list-info > small:first-child:contains(الحالة) + small')?.text();
      const status: MangaStatus =
        statusText === 'مستمرة' || statusText === 'قادم قريبًا'
          ? 'ongoing'
          : statusText === 'مكتمل'
            ? 'completed'
            : statusText === 'متوقف'
              ? 'hiatus'
              : 'unknown';
      const author = document.selectFirst('.full-list-info > small:first-child:contains(الرسام) + small')?.text();
      return {
        url: manga.url,
        title: document.selectFirst('div.author-info-title h1')?.text() || manga.title,
        description:
          document.selectFirst('div.review-content')?.text() ||
          document.selectFirst('div.review-content p')?.text() ||
          undefined,
        genres: document.select('div.review-author-info a').map((a) => a.text()),
        thumbnailUrl: document.selectFirst('div.text-right img')?.absUrl('src') || manga.thumbnailUrl,
        status,
        author: author && author !== 'غير معروف' ? author : undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const first = await load(manga.url);
      const lastPage = Math.max(
        1,
        ...first
          .select('ul.pagination a.page-link')
          .map((a) => Number.parseInt(a.text(), 10))
          .filter((n) => !Number.isNaN(n)),
      );
      const documents = [first];
      for (let page = 2; page <= lastPage; page++) documents.push(await load(`${manga.url}?page=${page}`));
      return documents.flatMap((document) =>
        document.select('div.chapter-card').flatMap((element): Chapter[] => {
          const link = element.selectFirst('a');
          if (!link || element.selectFirst('span.locked')) return [];
          const number = element.attr('data-number') ?? '';
          const title = element.selectFirst('div.chapter-info div.chapter-title')?.text();
          const invalid = [number, `الفصل ${number}`, `الفصل رقم ${number}`];
          const seconds = Number(element.attr('data-date'));
          return [
            {
              url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
              name: `الفصل ${number}${title && !invalid.includes(title) ? ` - ${title}` : ''}‏`,
              number: Number(number) || undefined,
              uploadedAt: seconds ? seconds * 1000 : undefined,
            },
          ];
        }),
      );
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      return document
        .select('div.image_list canvas[data-src], div.image_list img[src]')
        .map((element) => (element.attr('src') !== undefined ? element.absUrl('src') : element.absUrl('data-src')))
        .map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/series\/[^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase().replace(/^www\./, '') === hostOf(BASE_URL)
        ? { url: match[2]!, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
