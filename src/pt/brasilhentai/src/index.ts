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
import { USER_AGENT, hostOf, ownText, relativeUrl } from './common/utils';

const BASE_URL = 'https://brasilhentai.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const load = async (url: string) => html.load((await http.get(url, { headers })).body, { baseUrl: url });

async function list(url: string): Promise<MangaPage> {
  const doc = await load(url);
  return {
    items: doc.select('.content-area article').map((article) => {
      const a = article.selectFirst('a[title]');
      return {
        url: relativeUrl(a?.absUrl('href') ?? ''),
        title: a?.attr('title') ?? '',
        thumbnailUrl: article.selectFirst('img')?.absUrl('src'),
      };
    }),
    hasNextPage: doc.selectFirst('.next.page-numbers') !== null,
  };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`${BASE_URL}/page/${page}`),
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const category = typeof filters.category === 'string' ? filters.category : '';
      return list(
        category
          ? `${BASE_URL}/category/${category}/page/${page}/`
          : `${BASE_URL}/page/${page}?s=${encodeURIComponent(query)}`,
      );
    },
    async getFilters(): Promise<Filter[]> {
      const doc = await load(BASE_URL);
      const options = doc.select('#categories-2 li a').map((a) => ({
        label: ownText(a),
        value: (a.absUrl('href') ?? '').split('/').filter(Boolean).pop() ?? '',
      }));
      return options.length
        ? [{ type: 'select', id: 'category', label: 'Categoria', options: [{ label: '', value: '' }, ...options], default: '' }]
        : [];
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const doc = await load(BASE_URL + manga.url);
      return {
        url: manga.url,
        title: ownText(doc.selectFirst('h1')) || manga.title,
        thumbnailUrl: doc.selectFirst('.entry-content p a img')?.absUrl('src'),
        description: doc.selectFirst('.entry-content')?.text(),
        genres: doc.select('.cat-links a').map((a) => a.text()),
        author: doc.selectFirst('.author')?.text() || undefined,
        status: 'completed',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const doc = await load(BASE_URL + manga.url);
      const date = Date.parse(doc.selectFirst('.entry-date.published')?.attr('datetime') ?? '');
      return [{ url: manga.url, name: 'Capítulo único', uploadedAt: Number.isNaN(date) ? undefined : date }];
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const doc = await load(BASE_URL + chapter.url);
      return doc.select('.entry-content p > img').map((img, index) => ({ index, imageUrl: img.absUrl('src') }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const path = relativeUrl(url.replace(/[?#].*/, ''));
      return hostOf(url) === hostOf(BASE_URL) && path.split('/').filter(Boolean).length === 1 ? { url: path, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
