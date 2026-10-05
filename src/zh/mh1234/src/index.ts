import {
  type Chapter,
  type Filter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, ownText, relativeUrl } from './common/utils';

const BASE_URL = 'https://m.wmh1234.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const STATUSES: [string, string][] = [
  ['全部', '0'],
  ['连载', '1'],
  ['完结', '2'],
];
const SORTS: [string, string][] = [
  ['最新', 'id'],
  ['热门', 'hits'],
  ['更新', 'addtime'],
];
const NEXT_PAGE = '.pagination-wrapper a:contains(下一页), .pagination-wrapper a:contains(>)';

async function load(path: string): Promise<{ document: HtmlElement; url: string }> {
  const response = await http.get(absoluteUrl(BASE_URL, path), { headers });
  return { document: html.load(response.body, { baseUrl: response.url }), url: response.url };
}

async function mangaListParse(path: string): Promise<MangaPage> {
  const { document } = await load(path);
  const items = document.select('.comic-card').flatMap((element): MangaSummary[] => {
    const link = element.selectFirst('a.comic-card__link');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: link.selectFirst('.comic-card__title')?.text() ?? '',
        thumbnailUrl: link.selectFirst('img.comic-card__image')?.absUrl('data-src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst(NEXT_PAGE) != null };
}

const withPage = (path: string, page: number) => (page > 1 ? `${path}/page/${page}` : path);

function parseMangaDetails(document: HtmlElement, url: string): MangaDetails {
  const info = document.select('.mint-work-info p');
  const statusText = info[1]?.selectFirst('.mint-tag')?.text();
  const status: MangaStatus = statusText === '连载' ? 'ongoing' : statusText === '完结' ? 'completed' : 'unknown';
  return {
    url: relativeUrl(url),
    title: document.selectFirst('#mintWorkTitle')?.text() ?? '',
    author: info[0]?.text().replace(/ 著$/, '') || undefined,
    genres: ownText(info[1]).split(' ').filter(Boolean),
    status,
    description: document.selectFirst('#mintIntroPanel > div')?.text() || undefined,
  };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => mangaListParse(withPage('/category/order/hits', page)),
    getLatest: (page) => mangaListParse(withPage('/category/order/addtime', page)),
    async search(query, page, filters): Promise<MangaPage> {
      if (query.trim()) return mangaListParse(withPage(`/search/${encodeURIComponent(query)}`, page));
      const value = (id: string, fallback: string) =>
        typeof filters[id] === 'string' && filters[id] ? (filters[id] as string) : fallback;
      return mangaListParse(
        withPage(
          `/category/tags/${value('genre', '0')}/finish/${value('status', '0')}/order/${value('sort', 'id')}`,
          page,
        ),
      );
    },
    async getFilters(): Promise<Filter[]> {
      const filters: Filter[] = [];
      try {
        const { document } = await load('/category/');
        const genres = document
          .select('a.filter-tag')
          .map((a) => ({ label: a.text(), value: (a.attr('href') ?? '').split('/').pop() ?? '' }));
        if (genres.length)
          filters.push({ type: 'select', id: 'genre', label: '题材', options: genres, default: genres[0]!.value });
      } catch (error) {
        log.warn('Cannot load genres', error);
      }
      filters.push(
        {
          type: 'select',
          id: 'status',
          label: '状态',
          options: STATUSES.map(([label, value]) => ({ label, value })),
          default: '0',
        },
        {
          type: 'select',
          id: 'sort',
          label: '排序',
          options: SORTS.map(([label, value]) => ({ label, value })),
          default: 'id',
        },
      );
      return filters;
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document, url } = await load(manga.url);
      return { ...parseMangaDetails(document, url), thumbnailUrl: manga.thumbnailUrl };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { document } = await load(manga.url);
      const links = document.select('.mint-chapter-grid a');
      return links.flatMap((element, index): Chapter[] => {
        const name = ownText(element);
        if (name.includes('APP')) return [];
        return [
          {
            url: relativeUrl(element.absUrl('href') || element.attr('href') || ''),
            name,
            number: links.length - index,
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      let response = await http.get(absoluteUrl(BASE_URL, chapter.url), { headers });
      // Handle the redirection to the reader in JS.
      const redirect = /replace\(["'](https:\/\/.*?)["']/.exec(response.body.slice(0, 10240))?.[1];
      if (redirect) response = await http.get(redirect, { headers });
      const document = html.load(response.body, { baseUrl: response.url });
      return document
        .select('img.reader-image')
        .map((img, index) => ({ index, imageUrl: img.absUrl('data-src') ?? '' }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)(\/[^?#]+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase() !== hostOf(BASE_URL)) return null;
      return { url: match[2]!, title: '' };
    },
  }),
});
