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
import { USER_AGENT, absoluteUrl, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://tranh18.cc';
const headers = { 'User-Agent': USER_AGENT };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function parseMangaPage(document: HtmlElement): MangaPage {
  const items = document.select('.box-body ul li, .manga-list ul li').flatMap((element): MangaSummary[] => {
    const box = element.selectFirst('.mh-item, .manga-list-2-cover');
    const a = box?.selectFirst('a');
    if (!box || !a) return [];
    const style = box.selectFirst('p.mh-cover')?.attr('style') ?? '';
    const original = box.selectFirst('img')?.attr('data-original');
    const thumbnailUrl = style.includes('url(')
      ? BASE_URL + style.split('url(')[1]!.split(')')[0]!
      : original
        ? BASE_URL + original
        : undefined;
    return [{ url: relativeUrl(a.absUrl('href') || a.attr('href') || ''), title: a.attr('title') ?? '', thumbnailUrl }];
  });
  return { items, hasNextPage: document.selectFirst('.page-pagination li.active ~ li:not(.disabled) a') !== null };
}

function parseStatus(text: string): MangaStatus {
  const lower = text.toLowerCase();
  if (['đang tiến hành', 'đang cập nhật'].some((s) => lower.includes(s))) return 'ongoing';
  if (['hoàn thành', 'đã hoàn thành', 'đã hoàn tất'].some((s) => lower.includes(s))) return 'completed';
  if (['tạm ngưng', 'tạm hoãn'].some((s) => lower.includes(s))) return 'hiatus';
  return 'unknown';
}

const options = (document: HtmlElement, id: string) =>
  document.select(`#${id} dd`).map((dd) => ({ label: dd.text(), value: dd.attr('data-val') ?? '' }));

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(page: number): Promise<MangaPage> {
      return parseMangaPage(await load(page > 1 ? `${BASE_URL}/comics?page=${page}` : BASE_URL));
    },
    async getLatest(page: number): Promise<MangaPage> {
      return parseMangaPage(await load(page > 1 ? `${BASE_URL}/update?page=${page}` : `${BASE_URL}/update`));
    },
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      let url: string;
      if (query.trim()) url = `${BASE_URL}/search?keyword=${encodeURIComponent(query.trim())}&page=${page}`;
      else {
        const params = [
          ['tag', filters.tag],
          ['end', filters.end],
          ['area', filters.area],
        ]
          .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
          .map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
        url = `${BASE_URL}/comics?${[...params, `page=${page}`].join('&')}`;
      }
      return parseMangaPage(await load(url));
    },
    async getFilters(): Promise<Filter[]> {
      try {
        const document = await load(`${BASE_URL}/comics`);
        const select = (id: string, label: string, list: { label: string; value: string }[]): Filter[] =>
          list.length ? [{ type: 'select', id, label, options: list, default: list[0]!.value }] : [];
        return [
          { type: 'header', label: 'Không dùng chung với tìm kiếm bằng từ khóa.' },
          ...select('tag', 'Từ khóa', options(document, 'tags')),
          ...select('area', 'Thể loại', options(document, 'areas')),
          ...select('end', 'Tiến độ', options(document, 'end')),
        ];
      } catch (error) {
        log.warn('Cannot load filters', error);
        return [];
      }
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      const paragraphs = (selector: string) =>
        document
          .select(selector)
          .map((p) => p.text().trim().split('#')[0]!.trim())
          .join('\n');
      const statusBlock = selectIgnoreCase(document, '.block:contains(Trạng thái)');
      const author = selectIgnoreCase(
        document,
        '.subtitle:contains(Tác giả：), .detail-main-info-author:contains(Tác giả：) a',
      )[0]
        ?.text()
        .replace(/^Tác giả：/, '');
      return {
        url: manga.url,
        title:
          document
            .select('.info h1, .detail-main-info-title')
            .map((e) => e.text())
            .join(' ') || manga.title,
        genres: selectIgnoreCase(document, 'p.tip:contains(Từ khóa) span a, .detail-main-info-class span a').map((a) =>
          a.text(),
        ),
        description:
          (document.select('p.content').length ? paragraphs('p.content') : paragraphs('p.detail-desc')) || undefined,
        author: author || undefined,
        status: parseStatus(
          statusBlock.length
            ? statusBlock.map((e) => e.text()).join(' ')
            : document
                .select('.detail-list-title-1')
                .map((e) => e.text())
                .join(' '),
        ),
        thumbnailUrl:
          document.selectFirst('.banner_detail_form .cover img')?.absUrl('src') ||
          document.selectFirst('.detail-main-cover img')?.absUrl('data-original') ||
          manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      return document
        .select('ul.detail-list-select li')
        .flatMap((element): Chapter[] => {
          const a = element.selectFirst('a');
          if (!a) return [];
          const name = a.text();
          const number = Number.parseFloat(/(\d+(?:\.\d+)*)/.exec(name)?.[0] ?? '') || 0;
          return [{ url: relativeUrl(a.absUrl('href') || a.attr('href') || ''), name, number }];
        })
        .sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(absoluteUrl(BASE_URL, chapter.url));
      return document.select('.comicpage img').map((img, index) => {
        const url = img.absUrl('data-original') || img.absUrl('src') || '';
        // Some images come through a DuckDuckGo proxy: the real address is in `u`.
        const proxied = url.startsWith('https://external-content.duckduckgo.com/iu/')
          ? /[?&]u=([^&]+)/.exec(url)?.[1]
          : undefined;
        return { index, imageUrl: proxied ? decodeURIComponent(proxied) : url };
      });
    },
    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?tranh18\.cc(\/[^?#]+)/i.exec(url.trim());
      return match ? { url: match[1]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
