import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, parseDate } from './common/utils';
import { publusPages, publusTransform, publusAuthQuery, toPublusAuth } from './publus';

const BASE_URL = 'https://manga-5.com';
const HIDE_LOCKED = 'hide_locked';
const JST = 9 * 3600_000;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const GENRES: [string, string][] = [
  ['All', ''],
  ['オリジナル作品', 'オリジナル作品'],
  ['妖怪ウォッチシリーズ', '妖怪ウォッチシリーズ'],
  ['レベルファイブ作品', 'レベルファイブ作品'],
];
const SORTS: [string, string][] = [
  ['最新から', 'desc'],
  ['古い順', 'asc'],
];

type Doc = ReturnType<typeof html.load>;
async function load(url: string) {
  const res = await http.get(url, { headers });
  return { doc: html.load(res.body, { baseUrl: res.url }), url: res.url, body: res.body };
}

function parseList(doc: Doc): MangaPage {
  const items: MangaSummary[] = [];
  for (const a of doc.select('a.book-list-item')) {
    const title = a.selectFirst('h3.title')?.text().trim();
    const href = a.absUrl('href') ?? '';
    if (!title || !href) continue;
    items.push({
      url: `/content/${href.split('/').filter(Boolean).pop()}`,
      title,
      thumbnailUrl: a.selectFirst('img.thum')?.absUrl('data-src'),
    });
  }
  return { items, hasNextPage: doc.selectFirst('.pagination-list-item.to-next:not(.disabled)') != null };
}

export default defineExtension({
  preferences: () => [{ type: 'switch', key: HIDE_LOCKED, label: 'Hide Locked Chapters', default: false }],
  createSource: () => ({
    baseUrl: BASE_URL,
    imageHeaders: () => headers,
    async getPopular() {
      return parseList((await load(`${BASE_URL}/ranking`)).doc);
    },
    async getLatest(page) {
      return parseList((await load(`${BASE_URL}/series?p=${page}`)).doc);
    },
    getFilters(): Filter[] {
      return [
        { type: 'select', id: 'sort', label: 'Sort by', options: SORTS.map(([label, value]) => ({ value, label })) },
        { type: 'select', id: 'genre', label: 'Genres', options: GENRES.map(([label, value]) => ({ value, label })) },
      ];
    },
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const sort = typeof filters.sort === 'string' ? filters.sort : 'desc';
      const genre = typeof filters.genre === 'string' ? filters.genre : '';
      if (query.trim()) {
        return parseList((await load(`${BASE_URL}/search?k=${encodeURIComponent(query)}&p=${page}&order=${sort}`)).doc);
      }
      return parseList((await load(`${BASE_URL}/genre/${encodeURIComponent(genre)}?p=${page}&order=${sort}`)).doc);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { doc } = await load(absoluteUrl(BASE_URL, manga.url));
      const detail = doc.selectFirst('.comic-main-right-detail');
      const title = detail?.selectFirst('h1.comic-title')?.text().trim() ?? manga.title;
      return {
        url: manga.url,
        title,
        author:
          detail
            ?.select('.author-list .author')
            .map((a) => a.text().trim())
            .join(', ') || undefined,
        description: detail?.selectFirst('.comic-discription-text')?.text().trim(),
        thumbnailUrl: doc.selectFirst('.comic-main-thum-wrapper img')?.absUrl('src') ?? manga.thumbnailUrl,
        status: title.includes('完結') ? 'completed' : 'ongoing',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const hideLocked = prefs.get<boolean>(HIDE_LOCKED) === true;
      const url = absoluteUrl(BASE_URL, manga.url);
      let { doc } = await load(url);
      const chapters: Chapter[] = [];
      for (let page = 1; ; page++) {
        for (const a of doc.select('a.book-product-list-item')) {
          const locked = a.attr('class')?.split(/\s+/).includes('js-read') ?? false;
          if (hideLocked && locked) continue;
          const date = parseDate(a.selectFirst('p.update-date')?.text().trim().split(' ')[0], 'yyyy/MM/dd');
          chapters.push({
            url: `/product/${a.attr('data-id')}`,
            name: `${locked ? '🔒 ' : ''}${a.selectFirst('h4.title')?.text().trim() ?? ''}`,
            uploadedAt: date === undefined ? undefined : date - JST,
          });
        }
        if (!doc.selectFirst('.pagination-list-item.to-next:not(.disabled)')) break;
        doc = (await load(`${url}?p=${page + 1}`)).doc;
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const res = await http.get(absoluteUrl(BASE_URL, chapter.url), { headers });
      let cid: string | undefined;
      if (res.url.split('?')[0]!.endsWith('ads_before_launching_viewer.html')) {
        const doc = html.load(res.body, { baseUrl: res.url });
        const onclick = doc.selectFirst('button[onclick]')?.attr('onclick') ?? '';
        const target = onclick.split("'")[1] ?? '';
        cid = /[?&]cid=([^&]+)/.exec(target)?.[1];
      } else cid = /[?&]cid=([^&]+)/.exec(res.url)?.[1];
      if (!cid) throw new Error('Log in via WebView and purchase this product to read.');
      cid = decodeURIComponent(cid);
      // The license API needs the `access_id` cookie handed out by the product/ads page.
      const setCookie = res.headers['set-cookie'] ?? res.headers['Set-Cookie'] ?? '';
      const cookie = /(?:^|[\s,])(access_id(?:_up)?=[^;,\s]+)/g;
      const cookies = [...setCookie.matchAll(cookie)].map((m) => m[1]!);
      const content = (
        await http.get<{
          url?: string | null;
          cty?: number | string | null;
          auth_info?: Parameters<typeof toPublusAuth>[0];
        }>(`${BASE_URL}/api4js/contents/license?cid=${cid}`, {
          headers: { ...headers, Cookie: cookies.join('; ') },
          responseType: 'json',
        })
      ).body;
      const auth = toPublusAuth(content.auth_info);
      const contentUrl = content.url;
      if (!contentUrl) throw new Error('Log in via WebView and purchase this product to read.');
      if (Number(content.cty) === 3) throw new Error('Novels are not supported!');
      if (Number(content.cty) === 6) {
        const q = publusAuthQuery(auth);
        const pack = (
          await http.get<{ effectTargetImgs: string[] }[][]>(
            `${contentUrl.replace(/\/+$/, '')}/content.json${q ? `?${q}` : ''}`,
            { headers, responseType: 'json' },
          )
        ).body;
        return pack
          .flat()
          .flatMap((p) => p.effectTargetImgs)
          .map((path, index) => ({
            index,
            imageUrl: `${contentUrl.replace(/\/+$/, '')}/${path}${q ? `?${q}` : ''}`,
          }));
      }
      return publusPages(contentUrl, headers, auth);
    },
    transformImage: publusTransform,
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
