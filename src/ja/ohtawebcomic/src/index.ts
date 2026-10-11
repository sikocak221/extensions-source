import {
  type Chapter,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, ownText, relativeUrl, selectIgnoreCase } from './common/utils';
import { readerPages } from './reader';
import { descramblePage } from './speedbinb';

const BASE_URL = 'https://webcomic.ohtabooks.com';
const READER_HOME = 'https://www.yondemill.jp';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const load = async (url: string) => html.load((await http.get(url, { headers })).body, { baseUrl: url });

async function all(): Promise<MangaSummary[]> {
  const doc = await load(`${BASE_URL}/list/`);
  return doc.select('.bnrList ul li a').map((a) => ({
    url: relativeUrl(a.absUrl('href') ?? ''),
    title: a.selectFirst('.title')?.text() ?? '',
    thumbnailUrl: a.selectFirst('.pic img')?.absUrl('src'),
  }));
}

const chapterUrl = (id: string) => `${READER_HOME}/contents/${id}?view=1&u0=1`;
const openBookId = (a: { attr(name: string): string | undefined }) =>
  /openBook\('([^']*)'\)/.exec(a.attr('onclick') ?? '')?.[1] ?? '';

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      return { items: await all(), hasNextPage: false };
    },
    async search(query: string): Promise<MangaPage> {
      const q = query.toLowerCase();
      return { items: (await all()).filter((m) => m.title.toLowerCase().includes(q)), hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const doc = await load(BASE_URL + manga.url);
      const style = doc.selectFirst('.contentHeader')?.attr('style') ?? '';
      const thumb = /background-image:url\(([^)]*)\)/.exec(style)?.[1];
      const description = selectIgnoreCase(doc, 'h3.titleBoader:contains(作品について) + dl ~ p')
        .map((p) => p.text())
        .join('\n');
      return {
        url: manga.url,
        title: doc.selectFirst('[itemprop=name]')?.text() ?? manga.title,
        author: doc.selectFirst('[itemprop=author]')?.text(),
        thumbnailUrl: thumb ?? manga.thumbnailUrl,
        description: description || undefined,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const doc = await load(BASE_URL + manga.url);
      const numbered = doc
        .select('.backnumberList a[onclick*=openBook]')
        .map((a) => ({ a, number: Number(ownText(a.selectFirst('dt.number'))) || 0 }))
        .sort((x, y) => y.number - x.number)
        .map(({ a }) => ({ url: openBookId(a), name: a.selectFirst('div.title')?.text() ?? '' }));
      if (numbered.length) return numbered;
      return doc.select('.headBtnList a[onclick*=openBook]').map((a) => ({ url: openBookId(a), name: ownText(a) }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const loader = (await http.get(chapterUrl(chapter.url), { headers })).body;
      const match = /location\.href='([^']*)';/.exec(loader);
      if (!match) throw new Error('Reader url not found');
      const pages = await readerPages(match[1]!, { ...headers, Referer: `${READER_HOME}/` });
      if (!pages.length) throw new Error('Log in via WebView and purchase this chapter to read.');
      return pages;
    },
    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${READER_HOME}/` }),
    transformImage: (page: Page, bytes: Uint8Array): ImageTransform => descramblePage(page, bytes),
    resolveUrl(url: string): MangaSummary | null {
      const path = relativeUrl(url.replace(/[?#].*/, ''));
      return hostOf(url) === hostOf(BASE_URL) && /^\/[^/]+\/?$/.test(path) && !path.startsWith('/list')
        ? { url: path, title: '' }
        : null;
    },
    getWebUrl: (item) => ('name' in item ? chapterUrl(item.url) : BASE_URL + item.url),
  }),
});
