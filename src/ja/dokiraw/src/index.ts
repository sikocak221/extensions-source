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
import { USER_AGENT, absoluteUrl, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://dokiraw.click';
const GENRES = [
  'All',
  'フルカラー',
  'Ecchi',
  'エロい',
  'コメディ',
  'ロマンス',
  'アクション',
  'スポーツ',
  'ファンタジー',
  'SF',
  '異世界',
  '心理的',
  '青年',
];
const POPULAR_SELECTOR = 'div[class*=manga-item_item]';
const RESULTS_PER_PAGE = 20;
const POPULAR_PER_PAGE = 36;

const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string) {
  const res = await http.get(url, { headers });
  return html.load(res.body, { baseUrl: res.url });
}

function parse(doc: ReturnType<typeof html.load>, perPage: number): MangaPage {
  const els = doc.select(POPULAR_SELECTOR);
  const items: MangaSummary[] = [];
  for (const el of els) {
    const a = el.selectFirst('a[href*=/manga/]');
    if (!a) continue;
    const img = el.selectFirst('img');
    items.push({
      url: relativeUrl(a.absUrl('href') ?? ''),
      title: el.selectFirst('h3')?.text().trim() ?? '',
      thumbnailUrl: img?.absUrl('data-original') || img?.absUrl('src'),
    });
  }
  return { items, hasNextPage: els.length === perPage };
}

/** "3日前", "昨日", ... → epoch ms. */
function parseRelative(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const now = Date.now();
  if (text.includes('昨日')) return now - 86400_000;
  const n = parseInt(/(\d+)/.exec(text)?.[1] ?? '', 10);
  if (!Number.isFinite(n)) return undefined;
  const unit = text.includes('秒')
    ? 1000
    : text.includes('分')
      ? 60_000
      : text.includes('時')
        ? 3600_000
        : text.includes('日')
          ? 86400_000
          : text.includes('週')
            ? 7 * 86400_000
            : text.includes('月')
              ? 30 * 86400_000
              : text.includes('年')
                ? 365 * 86400_000
                : 0;
  return unit ? now - n * unit : undefined;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    imageHeaders: () => headers,
    async getPopular(page) {
      return parse(await load(`${BASE_URL}/hot?page=${page}`), POPULAR_PER_PAGE);
    },
    async getLatest(page) {
      return parse(await load(`${BASE_URL}/search/manga?status=-1&sort=15&page=${page}`), RESULTS_PER_PAGE);
    },
    getFilters(): Filter[] {
      return [
        { type: 'header', label: 'Search by Genre' },
        {
          type: 'select',
          id: 'genre',
          label: 'Genre',
          options: [{ value: '', label: 'All' }, ...GENRES.map((g) => ({ value: g, label: g }))],
        },
      ];
    },
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const genre = typeof filters.genre === 'string' ? filters.genre : '';
      let url = `${BASE_URL}/search/manga?`;
      if (query.trim()) url += `keyword=${encodeURIComponent(query)}&`;
      if (genre) url += `genre=${encodeURIComponent(genre)}&`;
      url += `page=${page}`;
      return parse(await load(url), RESULTS_PER_PAGE);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const doc = await load(absoluteUrl(BASE_URL, manga.url));
      const has = (text: string) => selectIgnoreCase(doc, 'div').some((d) => d.text().includes(text));
      return {
        url: manga.url,
        title: doc.selectFirst('div[class*=manga-detail_boxInfo] h1')?.text().trim() ?? manga.title,
        description: doc.select('div.work-break p').pop()?.text().trim(),
        genres: doc
          .select('tr')
          .filter((tr) => tr.text().includes('ジャンル'))
          .flatMap((tr) => tr.select('a[href*=genre]'))
          .map((a) => a.text().trim()),
        status: has('連載中') ? 'ongoing' : has('完結') ? 'completed' : 'unknown',
        thumbnailUrl: doc.selectFirst('img[src*=cover]')?.absUrl('src') ?? manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const doc = await load(absoluteUrl(BASE_URL, manga.url));
      const chapters: Chapter[] = [];
      for (const a of doc.select('a:has(div[class*=manga-detail_chapter])')) {
        const spans = a.selectFirst('div[class*=manga-detail_chapter]')?.select('span') ?? [];
        const name = spans[0]?.text().trim();
        if (!name) continue;
        chapters.push({
          url: relativeUrl(a.absUrl('href') ?? ''),
          name,
          number: parseFloat(/(\d+(?:\.\d+)?)/.exec(name)?.[1] ?? ''),
          uploadedAt: parseRelative(spans[1]?.text()),
        });
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const doc = await load(absoluteUrl(BASE_URL, chapter.url));
      return doc.select('div.page-chapter img').map((img, index) => ({
        index,
        imageUrl: img.absUrl('data-cdn') || img.absUrl('data-original') || img.absUrl('src') || '',
      }));
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
