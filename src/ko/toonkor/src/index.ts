import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, parseDate, relativeUrl } from './common/utils';

// The site rotates its domain (toonkor0.org, toonkor1.org …); chapter and manga urls are paths.
const BASE_URL = 'https://toonkor1.org';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const WEBTOONS_PATH = '/%EC%9B%B9%ED%88%B0'; // /웹툰
const MANGA_PATH = '/%EB%8B%A8%ED%96%89%EB%B3%B8'; // /단행본
const HENTAI_PATH = '/%EB%A7%9D%EA%B0%80'; // /망가
const ALL_STATUS_PATH = '/%EC%97%B0%EC%9E%AC'; // /연재
const COMPLETED_PATH = '/%EC%99%84%EA%B2%B0'; // /완결
const SORT_LATEST = '';
const SORT_POPULAR = '?fil=%EC%9D%B8%EA%B8%B0'; // ?fil=인기
const SORT_TITLE = '?fil=%EC%A0%9C%EB%AA%A9'; // ?fil=제목

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

async function list(path: string): Promise<MangaPage> {
  const document = await load(path);
  const items = document.select('div.section-item-inner').flatMap((element): MangaSummary[] => {
    const link = element.selectFirst('div.section-item-title a');
    const title = link?.selectFirst('h3')?.text();
    if (!link || !title) return [];
    return [
      {
        url: relativeUrl(link.attr('href') ?? ''),
        title,
        thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: false };
}

const pick = (filters: FilterState, id: string, fallback: string) =>
  typeof filters[id] === 'string' ? (filters[id] as string) : fallback;

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: () => list(`${WEBTOONS_PATH}${ALL_STATUS_PATH}${SORT_POPULAR}`),
    getLatest: () => list(`${WEBTOONS_PATH}${ALL_STATUS_PATH}${SORT_LATEST}`),
    getFilters: (): Filter[] => [
      { type: 'header', label: "Note: can't combine with text search!" },
      { type: 'separator' },
      {
        type: 'select',
        id: 'type',
        label: 'Type',
        options: [
          { value: WEBTOONS_PATH, label: 'Webtoons' },
          { value: MANGA_PATH, label: 'Manga' },
          { value: HENTAI_PATH, label: 'Hentai' },
        ],
      },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [
          { value: ALL_STATUS_PATH, label: 'All' },
          { value: COMPLETED_PATH, label: 'Completed' },
        ],
      },
      {
        type: 'select',
        id: 'sort',
        label: 'Sort',
        options: [
          { value: SORT_LATEST, label: 'Latest' },
          { value: SORT_POPULAR, label: 'Popular' },
          { value: SORT_TITLE, label: 'Title' },
        ],
      },
    ],
    search(query, _page, filters) {
      if (query.trim())
        return list(`/bbs/search.php?sfl=wr_subject%7C%7Cwr_content&stx=${encodeURIComponent(query.trim())}`);
      return list(
        pick(filters, 'type', WEBTOONS_PATH) +
          pick(filters, 'status', ALL_STATUS_PATH) +
          pick(filters, 'sort', SORT_LATEST),
      );
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const table = document.selectFirst('table.bt_view1');
      return {
        url: manga.url,
        title: table?.selectFirst('td.bt_title')?.text() || manga.title,
        author: table?.selectFirst('td.bt_label span.bt_data')?.text() || undefined,
        description: table?.selectFirst('td.bt_over')?.text() || undefined,
        thumbnailUrl: table?.selectFirst('td.bt_thumb img')?.absUrl('src') || manga.thumbnailUrl,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      return document.select('table.web_list tr:has(td.content__title)').flatMap((row): Chapter[] => {
        const title = row.selectFirst('td.content__title');
        const url = title?.attr('data-role');
        const name = title?.text();
        if (!url || !name) return [];
        // Dates are Seoul time.
        const date = parseDate(row.selectFirst('td.episode__index')?.text(), 'yyyy-MM-dd');
        return [{ url, name, uploadedAt: date === undefined ? undefined : date - 9 * 3_600_000 }];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      // Several scripts mention toon_img; only the one assigning the base64 blob is useful.
      const encoded = document
        .select('script')
        .map((script) => /toon_img\s*=\s*'([^']+)'/.exec(script.html())?.[1])
        .find(Boolean);
      if (!encoded) return [];
      const decoded = base64.decode(encoded);
      return [...decoded.matchAll(/src="([^"]*)"/g)].map((match, index) => ({
        index,
        imageUrl: match[1]!.startsWith('http') ? match[1]! : BASE_URL + match[1]!,
      }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[^?#]*)/i.exec(url.trim());
      if (!match || !/^toonkor\d*\./i.test(match[1]!)) return null;
      const path = match[2]!;
      if (path === '/' || /^\/(bbs|css|js)\//.test(path)) return null;
      return { url: path, title: '' };
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
