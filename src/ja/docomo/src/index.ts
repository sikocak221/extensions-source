import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, relativeUrl } from './common/utils';
import { publusPages, publusTransform } from './publus';

const BASE_URL = 'https://dbook.docomo.ne.jp';
const API_URL = 'https://dxp-system.docomo.ne.jp';
const SESSION_URL = 'https://rs4x.mw-pf.jp';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

type Doc = ReturnType<typeof html.load>;
async function load(url: string) {
  const res = await http.get(url, { headers });
  return { doc: html.load(res.body, { baseUrl: res.url }), res };
}

function parseList(doc: Doc): MangaPage {
  const items: MangaSummary[] = [];
  for (const el of doc.select('.o-ranking-list__item, .o-card-list-light__item')) {
    const a = el.selectFirst('a[href*=/item/]');
    const title = el.selectFirst('.m-basic-card__title, .m-card-light__title')?.text().trim();
    if (!a || !title) continue;
    items.push({
      url: relativeUrl(a.absUrl('href') ?? ''),
      title,
      thumbnailUrl: el.selectFirst('img.cd-cover')?.absUrl('src'),
    });
  }
  const next = doc.selectFirst('.m-pager__next');
  let hasNextPage: boolean;
  if (next && !(next.attr('style') ?? '').includes('display')) hasNextPage = next.selectFirst('a') != null;
  else {
    const items2 = doc.select('.m-pager__list li');
    const idx = items2.findIndex((li) => (li.attr('class') ?? '').split(/\s+/).includes('-current'));
    const following = idx >= 0 ? items2[idx + 1] : undefined;
    hasNextPage =
      !!following && following.selectFirst('a') != null && !(following.attr('style') ?? '').includes('display');
  }
  return { items, hasNextPage };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    imageHeaders: () => headers,
    async getPopular(page) {
      return parseList((await load(`${BASE_URL}/ranking/all/?s=daily&page=${page}`)).doc);
    },
    async search(query: string, page: number): Promise<MangaPage> {
      return parseList(
        (await load(`${BASE_URL}/search/?p=${page}&q=${encodeURIComponent(query)}&s=sort_seriespop&t=2&ss=1`)).doc,
      );
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { doc } = await load(absoluteUrl(BASE_URL, manga.url));
      return {
        url: manga.url,
        title: doc.selectFirst('h1.p-header__title')?.text().trim() ?? manga.title,
        author:
          doc
            .select('.p-information__author-list li a')
            .map((a) => a.text().trim())
            .join(', ') || undefined,
        description: doc.selectFirst('.o-product-information__summary-text')?.text().trim(),
        genres: doc.select('.m-data-list__name:contains(ジャンル) + .m-data-list__data a').map((a) => a.text().trim()),
        thumbnailUrl: doc.selectFirst('.p-cover__image img')?.absUrl('src') ?? manga.thumbnailUrl,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { doc } = await load(absoluteUrl(BASE_URL, manga.url));
      const seriesId = doc.selectFirst('input#series_id')?.attr('value');
      if (!seriesId) return [];
      const chapters: Chapter[] = [];
      for (let page = 1; ; page++) {
        const r = (
          await http.get<{ html: string; hasNext: boolean }>(
            `${API_URL}/element/seriesshelf/get_contents?seriesId=${encodeURIComponent(seriesId)}&order=a&page=${page}`,
            { headers, responseType: 'json' },
          )
        ).body;
        const fragment = html.load(r.html);
        for (const card of fragment.select('.o-series-list__card-item')) {
          const cid = card.selectFirst('.o-series-list__card')?.attr('data-product_id');
          const name = card.selectFirst('.o-series-list__card-title')?.text().trim();
          if (!cid || !name) continue;
          chapters.push({ url: `/view/?cid=${cid}&cti=${encodeURIComponent(name)}&cc=0000`, name });
        }
        if (!r.hasNext) break;
      }
      return chapters.reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const cid = /[?&]cid=([^&]+)/.exec(chapter.url)?.[1] ?? '';
      const { doc } = await load(absoluteUrl(BASE_URL, chapter.url));
      const sesid = doc.selectFirst('#mwrs4b-params')?.attr('data-sesid');
      if (!sesid) throw new Error('Log in via WebView and purchase this product to read.');
      const res = await http.request<{ url?: string | null }>({
        url: `${SESSION_URL}/responder/sessionValidate`,
        method: 'POST',
        headers,
        body: { form: { cid, sesid } },
        responseType: 'json',
      });
      const contentUrl = res.body?.url;
      if (!contentUrl) throw new Error('Log in via WebView and purchase this product to read.');
      let pages: Page[];
      try {
        pages = await publusPages(contentUrl, headers);
      } catch (e) {
        if (e instanceof Error && e.message.includes('403'))
          throw new Error('Log in via WebView and purchase this product to read.');
        throw e;
      }
      return pages;
    },
    transformImage: publusTransform,
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
