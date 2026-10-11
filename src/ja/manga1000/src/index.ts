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
import { USER_AGENT, absoluteUrl, relativeUrl } from './common/utils';

const BASE_URL = 'https://hachiraw.win';
const headers = { 'User-Agent': USER_AGENT, 'Upgrade-Insecure-Requests': '1', Referer: `${BASE_URL}/` };

const CATEGORIES: [string, string][] = [
  ['All', ''],
  ['Action', '6'],
  ['Adult', '7'],
  ['Adventure', '8'],
  ['Ecchi', '11'],
  ['Fantasy', '12'],
  ['Harem', '14'],
];

type Doc = ReturnType<typeof html.load>;
type El = NonNullable<ReturnType<Doc['selectFirst']>>;

async function getList(url: string): Promise<MangaPage> {
  const res = await http.get(url, { headers });
  const doc = html.load(res.body, { baseUrl: res.url });
  const img = (e: El | null | undefined) => e?.absUrl('data-src') || e?.absUrl('src');
  const items: MangaSummary[] = [];
  for (const el of doc.select('article.post.manga')) {
    const a = el.selectFirst('.entry-title a');
    if (!a) continue;
    items.push({
      url: relativeUrl(a.absUrl('href') ?? ''),
      title: a.text().trim(),
      thumbnailUrl: img(el.selectFirst('.featured-thumb img')),
    });
  }
  return { items, hasNextPage: doc.selectFirst('nav.pagination a.next') != null };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    imageHeaders: () => headers,
    getPopular: (page) => getList(page > 1 ? `${BASE_URL}/page/${page}/` : BASE_URL),
    getFilters(): Filter[] {
      return [
        { type: 'header', label: 'Note: Text search ignores categories' },
        { type: 'separator' },
        {
          type: 'select',
          id: 'category',
          label: 'Category',
          options: CATEGORIES.map(([label, value]) => ({ value, label })),
        },
      ];
    },
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) {
        return getList(`${BASE_URL}/search${page > 1 ? `/page/${page}` : ''}?query=${encodeURIComponent(query)}`);
      }
      const category = typeof filters.category === 'string' ? filters.category : '';
      let url = BASE_URL;
      if (category) url += `/category/${category}/`;
      if (page > 1) url += `${category ? '' : '/'}page/${page}/`;
      return getList(url);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const res = await http.get(absoluteUrl(BASE_URL, manga.url), { headers });
      const doc = html.load(res.body, { baseUrl: res.url });
      const ps = doc.select('.entry-content > p');
      const img = doc.selectFirst('.entry-content img');
      return {
        url: manga.url,
        title: (doc.selectFirst('h1.entry-title')?.text() ?? manga.title).split(' - ')[0]!.trim(),
        thumbnailUrl: img?.absUrl('data-src') || img?.absUrl('src') || manga.thumbnailUrl,
        author: ps
          .find((p) => p.text().includes('Author:'))
          ?.text()
          .replace('Author:', '')
          .trim(),
        genres: ps
          .filter((p) => p.text().includes('Category:'))
          .flatMap((p) => p.select('a'))
          .map((a) => a.text().trim()),
        description: ps
          .map((p) => p.text())
          .filter((t) => !t.includes('Author:') && !t.includes('Category:'))
          .join('\n'),
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const res = await http.get(absoluteUrl(BASE_URL, manga.url), { headers });
      const doc = html.load(res.body, { baseUrl: res.url });
      return doc.select('.chaplist table tbody tr td a').map((a) => ({
        url: relativeUrl(a.absUrl('href') ?? ''),
        name: a.text().trim() || 'Chapter',
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const res = await http.get(absoluteUrl(BASE_URL, chapter.url), { headers });
      const doc = html.load(res.body, { baseUrl: res.url });
      const pages: Page[] = [];
      for (const img of doc.select('.entry-content img')) {
        const url = img.absUrl('data-src') || img.absUrl('src');
        if (url && !url.includes('lazy.png')) pages.push({ index: pages.length, imageUrl: url });
      }
      return pages;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
