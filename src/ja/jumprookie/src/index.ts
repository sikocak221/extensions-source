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
import { absoluteUrl, relativeUrl } from './common/utils';

const BASE_URL = 'https://rookie.shonenjump.com';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';
const headers = { 'User-Agent': DESKTOP_UA, Referer: `${BASE_URL}/` };

const GENRES: [string, string][] = [
  ['TOP', ''],
  ['バトル', '1'],
  ['ファンタジー', '2'],
  ['学園・スポーツ', '3'],
  ['ラブコメ', '4'],
  ['コメディ・ギャグ', '6'],
  ['ミステリー・ホラー', '7'],
  ['その他', '8'],
];

type Doc = ReturnType<typeof html.load>;
type El = NonNullable<ReturnType<Doc['selectFirst']>>;

async function load(url: string) {
  const res = await http.get(url, { headers });
  return { doc: html.load(res.body, { baseUrl: res.url }), res };
}

function toManga(el: El): MangaSummary | undefined {
  const a = el.selectFirst('a');
  const title = el.selectFirst('.series-title')?.text().trim();
  if (!a || !title) return undefined;
  return {
    url: relativeUrl(a.absUrl('href') ?? ''),
    title,
    thumbnailUrl: el.selectFirst('.cover-image')?.absUrl('src'),
  };
}

const list = (doc: Doc, selector: string) =>
  doc
    .select(selector)
    .map(toManga)
    .filter((m): m is MangaSummary => !!m);

let nextPageKey: string | undefined;

async function seriesList(page: number, category?: string): Promise<MangaPage> {
  if (page === 1) nextPageKey = undefined;
  let url = `${BASE_URL}/api/media/series_list?type=popular`;
  if (category) url += `&category=${category}`;
  if (nextPageKey) url += `&key=${encodeURIComponent(nextPageKey)}`;
  const { doc, res } = await load(url);
  const next = res.headers['tky-link-rel-next'] ?? res.headers['Tky-Link-Rel-Next'];
  const m = next ? /[?&]key=([^&]+)/.exec(next) : null;
  nextPageKey = m ? decodeURIComponent(m[1]!) : undefined;
  return { items: list(doc, 'section.series-contents'), hasNextPage: nextPageKey != null };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    imageHeaders: () => headers,
    getPopular: (page) => seriesList(page),
    async getLatest(page) {
      const { doc } = await load(`${BASE_URL}/categories/general/recent?page=${page}`);
      return { items: list(doc, 'section.series-contents'), hasNextPage: doc.selectFirst('.button-next') != null };
    },
    getFilters(): Filter[] {
      return [
        { type: 'select', id: 'genre', label: 'Genres', options: GENRES.map(([label, value]) => ({ value, label })) },
      ];
    },
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query) {
        const { doc } = await load(`${BASE_URL}/search?query=${encodeURIComponent(query)}`);
        return { items: list(doc, '#search-series section.series-contents'), hasNextPage: false };
      }
      return seriesList(page, typeof filters.genre === 'string' ? filters.genre : undefined);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { doc } = await load(absoluteUrl(BASE_URL, manga.url));
      return {
        url: manga.url,
        title: doc.selectFirst('.series-title')?.text().trim() ?? manga.title,
        author: doc.selectFirst('.user-name')?.text().trim(),
        description: doc.selectFirst('.series-description')?.text().trim(),
        genres: doc.select('.series-category').map((c) => c.text().trim()),
        thumbnailUrl: doc.selectFirst('.cover-image')?.absUrl('src') ?? manga.thumbnailUrl,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { doc } = await load(absoluteUrl(BASE_URL, manga.url));
      const chapters: Chapter[] = [];
      for (const li of doc.select('#episode-list > li')) {
        const a = li.selectFirst('a.episode-content');
        if (!a) continue;
        chapters.push({
          url: relativeUrl(a.absUrl('href') ?? ''),
          name: li.selectFirst('.episode-title')?.text().trim() ?? '',
        });
      }
      return chapters.reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { doc } = await load(absoluteUrl(BASE_URL, chapter.url));
      return doc.select('.js-page-image').map((el, index) => ({ index, imageUrl: el.absUrl('src') ?? '' }));
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
