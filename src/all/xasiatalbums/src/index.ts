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
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://www.xasiat.com';
const ITEMS_PER_PAGE = 12;

const CATEGORIES: [string, string][] = [
  ['Allgravure', 'albums/tags/allgravure'],
  ['Amateur', 'albums/categories/amateur3'],
  ['Artgravia', 'albums/tags/artgravia'],
  ['Bejean On Line', 'albums/tags/bejean-on-line'],
  ['Big Comic Spirits', 'albums/tags/big-comic-spirits'],
  ['Bikini', 'albums/tags/bikini'],
  ['Black', 'albums/tags/black'],
  ['Bluecake', 'albums/tags/bluecake'],
  ['Bunny', 'albums/tags/bunny'],
  ['China & Taiwan', 'albums/categories/china-taiwan'],
  ['Cosplay', 'albums/tags/cosplay'],
  ['Djawa', 'albums/tags/djawa'],
  ['Espacia Korea', 'albums/tags/espacia-korea'],
  ['Fantia', 'albums/tags/fantia'],
  ['Flash', 'albums/tags/flash'],
  ['Friday', 'albums/tags/friday'],
  ['Friday Digital Photobook', 'albums/tags/friday-digital-photobook'],
  ['Friday Gold', 'albums/tags/friday-gold'],
  ['Gals', 'albums/tags/gals'],
  ['Girls', 'albums/tags/girls'],
  ['Girlz-High', 'albums/tags/girlz-high'],
  ['Graphis', 'albums/tags/graphis'],
  ['Gravure Idols', 'albums/categories/gravure-idols'],
  ['Japan', 'albums/tags/japan'],
  ['Japanese', 'albums/tags/japanese'],
  ['JAV & AV Models', 'albums/categories/jav'],
  ['JAV Amateur', 'albums/categories/jav-amateur'],
  ['JVID', 'albums/tags/jvid'],
  ['Korean', 'albums/tags/korean'],
  ['Leehee Express', 'albums/tags/leehee-express'],
  ['Loozy', 'albums/tags/loozy'],
  ['Lovepop', 'albums/tags/lovepop'],
  ['Maid', 'albums/tags/maid'],
  ['Night', 'albums/tags/night'],
  ['Nude', 'albums/tags/nude'],
  ['Onlyfans', 'albums/tags/onlyfans'],
  ['Patreon', 'albums/tags/patreon'],
  ['Photobook', 'albums/tags/photobook'],
  ['Pure Media', 'albums/tags/pure-media'],
  ['School', 'albums/tags/school'],
  ['Shonen Magazine', 'albums/tags/shonen-magazine'],
  ['Shonen Sunday', 'albums/tags/shonen-sunday'],
  ['South Korea', 'albums/categories/korea'],
  ['Southeast Asia', 'albums/categories/southeast-asia'],
  ['Summertime', 'albums/tags/summertime'],
  ['Swimsuit', 'albums/tags/swimsuit'],
  ['Teen', 'albums/tags/teen'],
  ['Tiny Body', 'albums/tags/tiny-body'],
  ['Uniform', 'albums/tags/uniform'],
  ['Weekly Playboy', 'albums/tags/weekly-playboy'],
  ['Western Girls', 'albums/categories/western-girls'],
  ['Xiaoyu', 'albums/tags/xiaoyu'],
  ['Xiuren', 'albums/tags/xiuren'],
  ['Yanmaga Web', 'albums/tags/yanmaga-web'],
  ['Young Champion', 'albums/tags/young-champion'],
  ['Young Jump', 'albums/tags/young-jump'],
  ['Young Magazine', 'albums/tags/young-magazine'],
  ['Yuuhui', 'albums/tags/yuuhui'],
];

const headers = { 'User-Agent': USER_AGENT, 'X-Requested-With': 'XMLHttpRequest' };
const abs = (u: string) => (u.startsWith('http') ? u : u.startsWith('//') ? `https:${u}` : BASE_URL + u);
const rel = (u: string) => u.replace(/^https?:\/\/[^/]+/, '');

async function block(path: string, blockId: string, page: number, params: Record<string, string>): Promise<MangaPage> {
  const offset = (page - 1) * ITEMS_PER_PAGE + 1;
  const q: Record<string, string> = {};
  q['mode'] = 'async';
  q['function'] = 'get_block';
  q['block_id'] = blockId;
  q['from'] = String(offset);
  if (blockId.includes('search')) q['from_albums'] = String(offset);
  Object.assign(q, params);
  q['_'] = String(Date.now());
  const url = `${BASE_URL}/${path.replace(/^\/|\/$/g, '')}?${Object.entries(q)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')}`;
  const res = await http.get(url, { headers });
  const doc = html.load(res.body, { baseUrl: url });
  const seen = new Set<string>();
  const items: MangaSummary[] = [];
  for (const a of doc.select('.list-albums .item a[href]')) {
    const href = a.absUrl('href') ?? '';
    if (!href || !href.includes('/albums/')) continue;
    const u = rel(href);
    if (seen.has(u)) continue;
    seen.add(u);
    const img = a.selectFirst('img');
    items.push({
      url: u,
      title: a.attr('title') || img?.attr('alt') || '',
      thumbnailUrl: img?.absUrl('data-original') || img?.absUrl('src'),
    });
  }
  const hasNextPage =
    doc.select('.pagination a[href], .pages a[href], .pager a[href]').some((e) => /next/i.test(e.text())) ||
    items.length >= ITEMS_PER_PAGE;
  return { items, hasNextPage };
}

const LIST = 'list_albums_common_albums_list';

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),
    getPopular: (page) => block('albums/', LIST, page, { sort_by: 'album_viewed_week' }),
    getLatest: (page) => block('albums/', LIST, page, { sort_by: 'post_date' }),
    getFilters(): Filter[] {
      return [
        { type: 'header', label: 'Tags update dynamically after opening albums' },
        { type: 'separator' },
        {
          type: 'select',
          id: 'category',
          label: 'Category',
          options: [{ value: '', label: 'None' }, ...CATEGORIES.map(([label, value]) => ({ value, label }))],
        },
      ];
    },
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const category = typeof filters.category === 'string' ? filters.category : '';
      if (query.trim()) return block('search/search/', 'list_albums_albums_list_search_result', page, { q: query });
      if (category) return block(category, LIST, page, {});
      return block('albums/', LIST, page, { sort_by: 'post_date' });
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const res = await http.get(abs(manga.url), { headers });
      const doc = html.load(res.body, { baseUrl: res.url });
      return {
        url: manga.url,
        title: doc.selectFirst('.entry-title')?.text().trim() || manga.title,
        description: doc.selectFirst('meta[property=og:description]')?.attr('content') ?? '',
        thumbnailUrl: doc.selectFirst('meta[property=og:image]')?.attr('content') ?? manga.thumbnailUrl,
        genres: doc
          .select('.info-content a')
          .filter((a) => (a.absUrl('href') ?? '').includes('/albums/'))
          .map((a) => a.text().trim())
          .filter(Boolean),
        status: 'completed',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const res = await http.get(abs(manga.url), { headers });
      return [{ url: rel(res.url) || manga.url, name: 'Photobook', uploadedAt: Date.now() }];
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const url = abs(chapter.url);
      const res = await http.get(url, { headers });
      const doc = html.load(res.body, { baseUrl: res.url });
      const urls = doc
        .select("a.item[href], a[href*='/get_image/']")
        .map((a) => a.absUrl('href') ?? '')
        .filter((u) => u.includes('/get_image/'));
      return [...new Set(urls)].map((imageUrl, index) => ({ index, imageUrl }));
    },
    getWebUrl: (item) => abs(item.url),
  }),
});
