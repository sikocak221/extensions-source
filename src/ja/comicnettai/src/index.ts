import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, parseDate, relativeUrl } from './common/utils';
import { publusPages, publusTransform } from './publus';

const BASE_URL = 'https://www.comicnettai.com';
const JST = 9 * 3600_000;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

type Doc = ReturnType<typeof html.load>;
async function load(url: string) {
  const res = await http.get(url, { headers });
  return html.load(res.body, { baseUrl: res.url });
}

const NEXT = '.pagenation__item:not(.is-hidde) .pagenation__item__link--next';

function parseList(doc: Doc): MangaPage {
  const items: MangaSummary[] = [];
  for (const el of doc.select('.full--comic__list .full--comic__item')) {
    const title = el.selectFirst('.full--comic__title')?.text().trim();
    const href = el.absUrl('href');
    if (!title || !href) continue;
    items.push({
      url: relativeUrl(href),
      title,
      thumbnailUrl: el.selectFirst('img.full--comic__thum')?.absUrl('data-src'),
    });
  }
  return { items, hasNextPage: doc.selectFirst(NEXT) != null };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    imageHeaders: () => headers,
    async getPopular(page) {
      return parseList(await load(`${BASE_URL}/series?page=${page}`));
    },
    async search(query: string, page: number): Promise<MangaPage> {
      return parseList(await load(`${BASE_URL}/search?q=${encodeURIComponent(query)}&page=${page}`));
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const doc = await load(absoluteUrl(BASE_URL, manga.url));
      return {
        url: manga.url,
        title: doc.selectFirst('.detail--title')?.text().trim() ?? manga.title,
        author:
          doc
            .select('.detail__author__item')
            .map((a) => a.text().trim())
            .join(', ') || undefined,
        description: doc.selectFirst('.detail--discription')?.text().trim(),
        thumbnailUrl: doc.selectFirst('.detail-catch__img')?.absUrl('src') ?? manga.thumbnailUrl,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      let doc = await load(absoluteUrl(BASE_URL, manga.url));
      const chapters: Chapter[] = [];
      for (;;) {
        for (const a of doc.select('.detail--product__list a.detail--product__item')) {
          const cid = /[?&]cid=([^&]+)/.exec(a.absUrl('href') ?? '')?.[1];
          if (!cid) continue;
          const date = parseDate(a.selectFirst('.detail--product__item__sdate')?.text().trim(), 'yyyy.MM.dd');
          chapters.push({
            url: `/publus/viewer.html?cid=${cid}`,
            name: a.selectFirst('.detail--product__item__title')?.text().trim() ?? '',
            uploadedAt: date === undefined ? undefined : date - JST,
          });
        }
        const next = doc.selectFirst(NEXT)?.absUrl('href');
        if (!next) break;
        doc = await load(next);
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const cid = /[?&]cid=([^&]+)/.exec(chapter.url)?.[1];
      if (!cid) throw new Error('Chapter id not found');
      const content = (
        await http.get<{ url?: string | null }>(`${BASE_URL}/api/viewer/c?cid=${cid}`, {
          headers,
          responseType: 'json',
        })
      ).body;
      if (!content.url) throw new Error('Log in via WebView and purchase this chapter to read.');
      return publusPages(content.url, headers);
    },
    transformImage: publusTransform,
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
