import {
  type Chapter,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, parseDate, relativeUrl } from './common/utils';
import { readerPages } from './reader';
import { descramblePage } from './speedbinb';

const BASE_URL = 'https://yanmaga.jp';
const HIDE_LOCKED = 'hide_locked';
const LATEST_PER_PAGE = 12;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const xhrHeaders = { ...headers, 'X-Requested-With': 'XMLHttpRequest' };
const INSERTED_HTML_REGEX = /insertAdjacentHTML\(\s*['"]\w+['"],\s*("(?:[^"\\]|\\.)*")/g;

const load = async (url: string) => html.load((await http.get(url, { headers })).body, { baseUrl: url });

/** Pages answer with scripts that insert html: the inserted fragments are joined and parsed. */
async function loadInserted(url: string) {
  const body = (await http.get(url, { headers: xhrHeaders })).body;
  const fragment = [...body.matchAll(INSERTED_HTML_REGEX)].map((m) => JSON.parse(m[1]!) as string).join('');
  return html.load(fragment, { baseUrl: url });
}

/** The thumbnail urls carry a signed query that is dropped. */
const toThumbnail = (url: string | undefined) => (url ? url.split('?')[0] : undefined);

export default defineExtension({
  preferences: () => [{ type: 'switch', key: HIDE_LOCKED, label: 'Hide Locked Chapters', default: false }],
  createSource: (info) => {
    const isGravure = info.key === 'gravure';
    const workPath = isGravure ? 'gravures/books' : 'comics';
    const latestPath = isGravure ? workPath : 'comics/series';
    const workNameIndex = isGravure ? 2 : 1;
    const isGravureBook = (url: string) => url.startsWith('/gravures/books/');
    const chapterWeb = (c: Chapter) => `${BASE_URL}/${workPath}/${c.url}`;

    const banners = (doc: ReturnType<typeof html.load>): MangaSummary[] =>
      doc.select('a.banner-link').map((a) => ({
        url: relativeUrl(a.absUrl('href') ?? ''),
        title: a.selectFirst('.text-wrapper h2')?.text() ?? '',
        thumbnailUrl: toThumbnail(a.selectFirst('.img-bg-wrapper')?.absUrl('data-bg')),
      }));

    return {
      baseUrl: BASE_URL,
      async getPopular(page: number): Promise<MangaPage> {
        if (isGravure) {
          const doc = await load(`${BASE_URL}/gravures/series?page=${page}`);
          return {
            items: banners(doc),
            hasNextPage: doc.selectFirst('ul.pagination > li.page-item > a.page-next') !== null,
          };
        }
        const doc = await load(`${BASE_URL}/ranking?ranking-index=0`);
        const tab = doc.selectFirst('[data-tab-name]');
        return {
          items: (tab?.select('a.mod-ranking-v2-link') ?? []).map((a) => ({
            url: relativeUrl(a.absUrl('href') ?? ''),
            title: a.selectFirst('.mod-ranking-v2-title')?.text() ?? '',
            thumbnailUrl: toThumbnail(a.selectFirst('img')?.absUrl('data-src')),
          })),
          hasNextPage: false,
        };
      },
      async getLatest(page: number): Promise<MangaPage> {
        const doc = await loadInserted(`${BASE_URL}/${latestPath}/newer/more?offset=${(page - 1) * LATEST_PER_PAGE}`);
        const items = banners(doc);
        return { items, hasNextPage: items.length === LATEST_PER_PAGE };
      },
      async search(query: string, page: number): Promise<MangaPage> {
        let url = `${BASE_URL}/search?q=${encodeURIComponent(query)}`;
        if (isGravure) url += '&tab=gravures&sub=book';
        if (page > 1) url += `&page=${page}`;
        const response = await http.request({ url, headers });
        // No results are answered with a 404 error.
        if (response.status === 404) return { items: [], hasNextPage: false };
        const doc = html.load(response.body, { baseUrl: url });
        return {
          items: doc.select(`main a[href^="/${workPath}/"]:has(img)`).map((a) => ({
            url: relativeUrl(a.absUrl('href') ?? ''),
            title: a.selectFirst('p')?.text() ?? '',
            thumbnailUrl: toThumbnail(a.selectFirst('img')?.absUrl('src')),
          })),
          hasNextPage: doc.selectFirst('main a[rel=next]') !== null,
        };
      },
      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        if (isGravureBook(manga.url)) return { ...manga, status: 'completed' };
        const doc = await load(BASE_URL + manga.url);
        if (isGravure)
          return {
            url: manga.url,
            title: doc.selectFirst('.detail-header-title')?.text() ?? manga.title,
            genres: doc.select('.ga-tag').map((t) => t.text()),
            thumbnailUrl: toThumbnail(doc.selectFirst('.detail-header-image img')?.absUrl('src')) ?? manga.thumbnailUrl,
            status: 'unknown',
          };
        return {
          url: manga.url,
          title: doc.selectFirst('.detailv2-outline-title')?.text() ?? manga.title,
          author:
            doc
              .select('.detailv2-outline-author-item a')
              .map((a) => a.text())
              .join(', ') || undefined,
          description: doc.selectFirst('.detailv2-description')?.text() || undefined,
          genres: doc.select('.detailv2-tag .ga-tag').map((t) => t.text()),
          thumbnailUrl:
            toThumbnail(doc.selectFirst('.detailv2-thumbnail-image img')?.absUrl('src')) ?? manga.thumbnailUrl,
          status: doc.selectFirst('.detailv2-link-note') ? 'ongoing' : 'completed',
        };
      },
      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        if (isGravureBook(manga.url)) {
          const segments = manga.url.split('/').filter(Boolean);
          return [{ url: `${segments[2]}/${segments[3]}`, name: '作品' }];
        }
        const hide = prefs.get<boolean>(HIDE_LOCKED) === true;
        const chapters: Chapter[] = [];
        let offset = 0;
        for (;;) {
          const doc = await loadInserted(`${BASE_URL}${manga.url}/${isGravure ? 'more' : 'episodes'}?offset=${offset}`);
          const episodes = doc.select('li.mod-episode-item');
          for (const li of episodes) {
            const link = li.selectFirst('a.mod-episode-link');
            if (!link) continue;
            const locked =
              li.attr('class')?.split(/\s+/).includes('js-modal') ||
              li.selectFirst('.mod-episode-price:not(:has(.mod-episode-point--free))') !== null;
            if (hide && locked) continue;
            const segments = relativeUrl(link.absUrl('href') ?? '')
              .split('/')
              .filter(Boolean);
            const title = li.selectFirst('.mod-episode-title')?.text() ?? '';
            chapters.push({
              url: `${segments[workNameIndex]}/${segments[workNameIndex + 1]}`,
              name: locked ? `🔒 ${title}` : title,
              uploadedAt: parseDate(li.selectFirst('.mod-episode-date')?.text(), 'yyyy/MM/dd'),
            });
          }
          offset += episodes.length;
          if (episodes.length !== 150) break;
        }
        return chapters;
      },
      async getPages(chapter: Chapter): Promise<Page[]> {
        const url = chapterWeb(chapter);
        const doc = await load(url);
        if (doc.selectFirst('.ga-rental-modal-sign-up')) throw new Error('このストーリーを読むには WebView でログイン');
        if (doc.selectFirst('.ga-modal-open')) throw new Error('WebView でポイントを使用してこのストーリーをレンタル');
        return readerPages(url, headers);
      },
      imageHeaders: () => headers,
      transformImage: (page: Page, bytes: Uint8Array): ImageTransform => descramblePage(page, bytes),
      resolveUrl(url: string): MangaSummary | null {
        const path = relativeUrl(url.replace(/[?#].*/, ''));
        const re = isGravure ? /^\/gravures\/(books|series)\/[^/]+(\/[^/]+)?\/?$/ : /^\/comics\/[^/]+\/?$/;
        return hostOf(url) === hostOf(BASE_URL) && re.test(path) ? { url: path.replace(/\/$/, ''), title: '' } : null;
      },
      getWebUrl: (item) => ('name' in item ? chapterWeb(item) : BASE_URL + item.url),
    };
  },
});
