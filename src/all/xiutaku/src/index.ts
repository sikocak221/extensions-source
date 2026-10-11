import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://xiutaku.com';
const headers = { 'User-Agent': USER_AGENT };

async function load(url: string) {
  const res = await http.get(url, { headers });
  return html.load(res.body, { baseUrl: res.url });
}

function parsePage(doc: ReturnType<typeof html.load>): MangaPage {
  const items: MangaSummary[] = doc.select('.blog > div').flatMap((el) => {
    const link = el.selectFirst('.item-content .item-link');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') ?? ''),
        title: link.text().trim(),
        thumbnailUrl: el.selectFirst('img')?.absUrl('src'),
      },
    ];
  });
  return { items, hasNextPage: doc.selectFirst('.pagination-next:not([disabled])') != null };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),
    async getPopular(page) {
      return parsePage(await load(`${BASE_URL}/hot?start=${20 * (page - 1)}`));
    },
    async getLatest(page) {
      return parsePage(await load(`${BASE_URL}/?start=${20 * (page - 1)}`));
    },
    async search(query, page) {
      return parsePage(await load(`${BASE_URL}/?search=${encodeURIComponent(query)}&start=${20 * (page - 1)}`));
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const doc = await load(absoluteUrl(BASE_URL, manga.url));
      const title = doc.selectFirst('.article-header')?.text().trim();
      if (!title) throw new Error('Title is mandatory');
      return {
        url: manga.url,
        title,
        description: doc.selectFirst('.article-info:not(:has(small))')?.text().trim(),
        genres: (doc.selectFirst('.article-tags')?.select('.tags > .tag') ?? []).map((t) =>
          t.text().trim().replace(/^#/, ''),
        ),
        status: 'completed',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const doc = await load(absoluteUrl(BASE_URL, manga.url));
      const dateText = doc.selectFirst('.article-info > small')?.text().trim().replace(/^🕒/, '').trim();
      const uploadedAt = parseDate(dateText, 'HH:mm d-M-yyyy');
      const maxPage = parseInt(doc.selectFirst('.pagination-list > span:last-child > a')?.text() ?? '', 10) || 1;
      const base = manga.url.split('?')[0]!;
      const chapters: Chapter[] = [];
      for (let page = maxPage; page >= 1; page--)
        chapters.push({ url: `${base}?page=${page}`, name: `Page ${page}`, uploadedAt });
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const doc = await load(absoluteUrl(BASE_URL, chapter.url));
      return doc.select('.article-fulltext img').map((img, index) => ({ index, imageUrl: img.absUrl('src') ?? '' }));
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
