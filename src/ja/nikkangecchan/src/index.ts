import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://nikkangecchan.jp';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const load = async (url: string) => html.load((await http.get(url, { headers })).body, { baseUrl: url });

async function all(): Promise<MangaSummary[]> {
  const doc = await load(BASE_URL);
  const items: MangaSummary[] = [];
  for (const figure of doc.select('.contentInner > figure')) {
    const imgBox = figure.selectFirst('.imgBox');
    const detailBox = figure.select('.detailBox').pop();
    const title = detailBox?.selectFirst('h3')?.text();
    const href = imgBox?.selectFirst('a')?.absUrl('href');
    if (!title || !href) continue;
    items.push({ url: relativeUrl(href), title, thumbnailUrl: imgBox?.selectFirst('a > img')?.absUrl('src') });
  }
  return items;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      return { items: await all(), hasNextPage: false };
    },
    // The site has no search: filter the complete list.
    async search(query: string): Promise<MangaPage> {
      const q = query.toLowerCase();
      return { items: (await all()).filter((m) => m.title.toLowerCase().includes(q)), hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const doc = await load(BASE_URL + manga.url);
      const box = doc.selectFirst('#comicDetail .detailBox');
      if (!box) throw new Error('Detail box not found');
      const author = box.selectFirst('.author')?.text();
      return {
        url: manga.url,
        title: box.selectFirst('h3')?.text() ?? manga.title,
        thumbnailUrl: manga.thumbnailUrl,
        author,
        artist: author,
        description: doc.selectFirst('.description')?.text(),
        status: 'ongoing',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const doc = await load(BASE_URL + manga.url);
      const chapters: Chapter[] = [];
      for (const box of doc.select('.episodeBox')) {
        const page = box.selectFirst('.episode-page');
        const title = box.selectFirst('h4.episodeTitle')?.text();
        if (!page || !title) continue;
        const dataTitle = (page.attr('data-title') ?? '').split('|')[0]!.trim();
        const src = page.absUrl('data-src') || BASE_URL + (page.attr('data-src') ?? '');
        chapters.push({
          url: relativeUrl(src.slice(0, src.lastIndexOf('/'))),
          name: dataTitle ? `${title} - ${dataTitle}` : title,
          number: Number.parseFloat(title) || undefined,
          scanlator: 'Akita Publishing',
        });
      }
      return chapters.reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      return [{ index: 0, url: chapter.url, imageUrl: `${BASE_URL}${chapter.url}/image` }];
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const path = relativeUrl(url.replace(/[?#].*/, ''));
      return hostOf(url) === hostOf(BASE_URL) && path.split('/').filter(Boolean).length >= 2
        ? { url: path, title: '' }
        : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
