import {
  type Chapter,
  type Filter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://hanimeone.me';
const COMICS = `${BASE_URL}/comics`;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const SORTS: [string, string][] = [
  ['最新', ''],
  ['熱門：本日', 'popular-today'],
  ['熱門：本週', 'popular-week'],
  ['熱門：所有', 'popular'],
];

async function load(url: string): Promise<{ document: HtmlElement; url: string }> {
  const response = await http.get(url, { headers });
  return { document: html.load(response.body, { baseUrl: response.url }), url: response.url };
}

const extraSrc = (srcset: string | undefined) => (srcset ?? '').split(',')[0]!.trim();

function comicDivToManga(element: HtmlElement): MangaSummary {
  return {
    url: relativeUrl(element.selectFirst('a')?.absUrl('href') ?? ''),
    title: element.selectFirst('div.comic-rows-videos-title')?.text() ?? '',
    thumbnailUrl: extraSrc(element.selectFirst('img')?.attr('data-srcset')) || undefined,
  };
}

/** The values (`div.no-select` chips) of the info row labelled `key`. */
function selectInfo(key: string, brief: HtmlElement | null | undefined): string[] {
  const holder = (brief?.select('h5, div, span') ?? []).find((e) => (e.html().split('<')[0] ?? '').includes(key));
  return (holder?.select('div.no-select') ?? []).map((e) => e.text()).filter(Boolean);
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const { document } = await load(COMICS);
      return {
        items: document.select('h3:contains(發燒漫畫) ~ div.comic-rows-videos-div').map(comicDivToManga),
        hasNextPage: false,
      };
    },
    async getLatest(page): Promise<MangaPage> {
      const { document } = await load(`${COMICS}?page=${page}`);
      return {
        items: document.select('h3:contains(最新上傳) ~ div.comic-rows-videos-div').map(comicDivToManga),
        hasNextPage: document.selectFirst('ul.pagination a[rel=next]') != null,
      };
    },
    async search(query, page, filters): Promise<MangaPage> {
      const sort = typeof filters.sort === 'string' ? filters.sort : '';
      const { document } = await load(
        `${COMICS}/search?query=${encodeURIComponent(query)}&page=${page}${sort ? `&sort=${sort}` : ''}`,
      );
      return {
        items: document.select('div#comics-search-tag-top-row + div div.comic-rows-videos-div').map(comicDivToManga),
        hasNextPage: document.selectFirst('ul.pagination a[rel=next]') != null,
      };
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'sort',
        label: 'Sort',
        options: SORTS.map(([label, value]) => ({ label, value })),
        default: '',
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(absoluteUrl(BASE_URL, manga.url));
      const top = document.selectFirst('h3.title.comics-metadata-top-row');
      // The brief column next to the cover.
      const brief = document.selectFirst('div.col-md-8');
      const cover = document.selectFirst('div.col-md-4 img')?.attr('data-srcset');
      return {
        url: manga.url,
        title: top?.text().replace(/\s+/g, ' ').trim() || manga.title,
        thumbnailUrl: extraSrc(cover) || manga.thumbnailUrl,
        author: (selectInfo('作者：', brief)[0] ?? selectInfo('社團：', brief)[0]) || undefined,
        genres: [...selectInfo('分類：', brief), ...selectInfo('標籤：', brief)],
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { document, url: requestUrl } = await load(absoluteUrl(BASE_URL, manga.url));
      const chapters = document.select('h3:contains(相關集數列表) ~ div.comic-rows-videos-div').map((element) => {
        const comicUrl = element.selectFirst('a')?.absUrl('href') ?? '';
        const title = element.selectFirst('div.comic-rows-videos-title')?.text() ?? '';
        return {
          url: relativeUrl(`${comicUrl}/1`),
          name: `${requestUrl === comicUrl ? '當前' : '關聯'}：${title}`,
        };
      });
      return chapters.length > 0 ? chapters : [{ url: relativeUrl(`${requestUrl}/1`), name: '單章節' }];
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const chapterUrl = absoluteUrl(BASE_URL, chapter.url);
      const { document } = await load(chapterUrl);
      const current = document.selectFirst('img#current-page-image');
      const dataExtension = current?.attr('data-extension') ?? '';
      const dataPrefix = current?.attr('data-prefix') ?? '';
      const pageSize = Number.parseInt(document.selectFirst('.comic-show-content-nav')?.attr('data-pages') ?? '0', 10);
      // Galleries mix jpg/webp per page and data-extension only matches the first one; the comic page
      // lists a thumbnail ("<n>t.<ext>") per page with the right extension.
      const comicUrl = chapterUrl.slice(0, chapterUrl.lastIndexOf('/'));
      const extensions = new Map<string, string>();
      const { document: comic } = await load(comicUrl);
      for (const anchor of comic.select('a[href]')) {
        const href = anchor.absUrl('href') ?? '';
        if (!href.startsWith(`${comicUrl}/`)) continue;
        const img = anchor.selectFirst('img[data-srcset]');
        if (!img) continue;
        extensions.set(href.split('/').pop()!, extraSrc(img.attr('data-srcset')).split('.').pop() ?? '');
      }
      return Array.from({ length: pageSize }, (_, index) => {
        const number = String(index + 1);
        return { index, imageUrl: `${dataPrefix}${number}.${extensions.get(number) || dataExtension}` };
      });
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)(\/comic\/\d+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase() !== hostOf(BASE_URL)) return null;
      return { url: match[2]!, title: '' };
    },
  }),
});
