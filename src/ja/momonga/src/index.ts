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
import { USER_AGENT, hostOf, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://momon-ga.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const CATEGORIES = [
  { label: '同人誌', value: 'fanzine' },
  { label: '商業誌', value: 'magazine' },
  { label: '急上昇', value: 'trend' },
  { label: '人気', value: 'popularity' },
  { label: '高評価', value: 'rated' },
];

const getDoc = async (url: string) => {
  const response = await http.get(url, { headers });
  return { doc: html.load(response.body, { baseUrl: url }), url: response.url };
};

async function list(url: string): Promise<MangaPage> {
  const { doc } = await getDoc(url);
  const items = doc.select('div.post-list > a').map((a) => ({
    url: relativeUrl(a.absUrl('href') ?? ''),
    title: a.selectFirst('span')?.text() ?? '',
    thumbnailUrl: a.selectFirst('div.post-list-image > img')?.absUrl('src'),
  }));
  return {
    // The popularity page lists some entries twice.
    items: items.filter((m, i) => items.findIndex((o) => o.url === m.url) === i),
    hasNextPage: doc.selectFirst('div.wp-pagenavi > a.nextpostslink') !== null,
  };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: () => list(`${BASE_URL}/popularity/`),
    getFilters: (): Filter[] => [
      { type: 'select', id: 'category', label: 'カテゴリーグループ', options: CATEGORIES, default: 'fanzine' },
    ],
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const category = typeof filters.category === 'string' ? filters.category : 'fanzine';
      let url =
        query && !query.includes('-') ? `${BASE_URL}/?s=${encodeURIComponent(query)}` : `${BASE_URL}/${category}`;
      if (page > 1) url = url.includes('?') ? url.replace('/?', `/page/${page}?`) : `${url}/page/${page}`;
      return list(url);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { doc } = await getDoc(BASE_URL + manga.url);
      const details: MangaDetails = {
        url: manga.url,
        title: doc.selectFirst('#post-data > h1')?.text() ?? manga.title,
        thumbnailUrl: doc.selectFirst('#post-hentai > img')?.absUrl('src') ?? manga.thumbnailUrl,
        status: 'completed',
      };
      for (const div of doc.select('#post-tag > div.post-tag-table')) {
        const tags = div.select('div.post-tags > a').map((a) => a.text());
        switch (div.selectFirst('div.post-tag-title')?.text()) {
          case 'サークル':
            details.artist = tags.join(', ');
            break;
          case '作者':
            details.author = tags.join(', ');
            break;
          case '内容':
            details.genres = tags;
            break;
        }
      }
      return details;
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { doc, url } = await getDoc(BASE_URL + manga.url);
      return [
        {
          url: relativeUrl(url),
          name: '単一章',
          uploadedAt: parseDate(doc.selectFirst('#post-time')?.text(), 'yyyy年M月d日H時'),
        },
      ];
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { doc } = await getDoc(BASE_URL + chapter.url);
      return doc.select('#post-hentai > img').map((img, index) => ({ index, imageUrl: img.attr('src') ?? '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const path = relativeUrl(url.replace(/[?#].*/, ''));
      return hostOf(url) === hostOf(BASE_URL) && /^\/[^/]+\/[^/]+\/?$/.test(path) ? { url: path, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
