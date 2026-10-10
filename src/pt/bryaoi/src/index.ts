import { type Chapter, type MangaDetails, type MangaPage, type MangaSummary, type Page, defineExtension } from '@matane/extension-sdk';
import { USER_AGENT, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://bryaoi.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const load = async (url: string) => html.load((await http.get(url, { headers })).body, { baseUrl: url });

async function list(query: string, page: number): Promise<MangaPage> {
  const doc = await load(`${BASE_URL}/yaoi/page/${page}?s=${encodeURIComponent(query)}`);
  return {
    items: doc.select('.listagem .item a').map((a) => ({
      url: relativeUrl(a.absUrl('href') ?? ''),
      title: a.selectFirst('h2')?.text() ?? '',
      thumbnailUrl: a.selectFirst('img')?.absUrl('src'),
    })),
    hasNextPage: doc.selectFirst('.next.page-numbers') !== null,
  };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list('', page),
    search: (query, page) => list(query, page),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const doc = await load(BASE_URL + manga.url);
      const title = (doc.selectFirst('h1')?.text() ?? '').replace(/^.*?Ler/, '').replace(/Online[^]*$/, '').trim();
      return {
        url: manga.url,
        title: title || manga.title,
        thumbnailUrl: doc.selectFirst('.serie-capa img')?.absUrl('src'),
        description: doc
          .select('.serie-texto p')
          .map((p) => p.text())
          .join('\n'),
        genres: doc.select('.serie-infos a').map((a) => a.text()),
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const doc = await load(BASE_URL + manga.url);
      return doc
        .select('.capitulos a')
        .map((a) => ({ url: relativeUrl(a.absUrl('href') ?? ''), name: a.text() }))
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const doc = await load(BASE_URL + chapter.url);
      return doc.select('#images_all img').map((img, index) => ({ index, imageUrl: img.absUrl('src') }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      return hostOf(url) === hostOf(BASE_URL) && /\/yaoi\/[^/]+\/?$/.test(url.replace(/[?#].*/, ''))
        ? { url: relativeUrl(url), title: '' }
        : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
