import {
  type Chapter,
  type Filter,
  type FilterState,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type TileOp,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf } from './common/utils';

const BASE_URL = 'https://www.mangaz.com';
const CATEGORIES = ['All', 'Mens', 'Womens', 'TL', 'BL', 'R18'];
const SORTS = ['Popular', 'New'];
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, cookie: '_LANG_=ja' };
const xhrHeaders = { ...headers, 'X-Requested-With': 'XMLHttpRequest' };

let r18Opened = false;

async function open(url: string, extra: Record<string, string> = headers) {
  if (!r18Opened && url.startsWith('https://r18.mangaz.com')) {
    r18Opened = true;
    await http.request({ url: 'https://r18.mangaz.com/attention/r18/yes', method: 'HEAD', headers });
  }
  const response = await http.get(url, { headers: extra });
  return { doc: html.load(response.body, { baseUrl: response.url }), url: response.url, body: response.body };
}

function mangas(doc: ReturnType<typeof html.load>, selector: string): MangaSummary[] {
  const items: MangaSummary[] = [];
  for (const li of doc.select(selector)) {
    // Titles waiting for a license cannot be read.
    if (li.selectFirst('.iconConsent')) continue;
    const href = li.selectFirst('a[href*=/detail/]')?.attr('href') ?? '';
    const img = li.selectFirst('img');
    items.push({
      url: `/series/detail/${href.slice(href.lastIndexOf('/') + 1)}`,
      title: li.selectFirst('h2, span.trim, h4')?.text() ?? '',
      thumbnailUrl: img?.attr('data-src') || img?.attr('src') || undefined,
    });
  }
  return items;
}

async function listing(url: string): Promise<MangaPage> {
  const items = mangas((await open(url, xhrHeaders)).doc, 'body > li');
  return { items, hasNextPage: items.length === 50 };
}

const idOf = (url: string) => url.slice(url.lastIndexOf('/') + 1);

/** The book id is part of the thumbnail url, which differs from the series id for user-published manga. */
function bookUrl(manga: MangaSummary): string {
  const thumb = manga.thumbnailUrl ?? '';
  const bookId = thumb.slice(0, thumb.lastIndexOf('/')).split('/').pop() ?? idOf(manga.url);
  return `${BASE_URL}/book/detail/${bookId}`;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      return { items: mangas((await open(`${BASE_URL}/ranking/views`)).doc, 'ul.rankingListThum > li, ul.itemList > li'), hasNextPage: false };
    },
    getLatest: (page) => listing(`${BASE_URL}/title/addpage_renewal?type=official&sort=new&page=${page}`),
    getFilters: (): Filter[] => [
      { type: 'select', id: 'category', label: 'Category', options: CATEGORIES.map((c) => ({ label: c, value: c })), default: 'All' },
      { type: 'select', id: 'sort', label: 'Sort', options: SORTS.map((c) => ({ label: c, value: c })), default: 'Popular' },
    ],
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const category = typeof filters.category === 'string' ? filters.category : 'All';
      const sort = typeof filters.sort === 'string' ? filters.sort : 'Popular';
      const host = category === 'R18' ? 'https://r18.mangaz.com' : BASE_URL;
      const params = [`query=${encodeURIComponent(query)}`, `page=${page}`];
      if (category !== 'All') params.push(`category=${category.toLowerCase()}`);
      params.push(`sort=${sort.toLowerCase()}`);
      return listing(`${host}/title/addpage_renewal?${params.join('&')}`);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { doc } = await open(bookUrl(manga));
      // Credit labels: 画 / マンガ for the artist, the others (作, 原作, 著) for the writer.
      const artists: string[] = [];
      const authors: string[] = [];
      for (const span of doc.select('span.bookinfoDetailAuthor')) {
        const name = span.selectFirst('a')?.text();
        if (!name) continue;
        const label = span.text().replace(name, '');
        (label.includes('画') || label.includes('マンガ') ? artists : authors).push(name);
      }
      return {
        url: manga.url,
        title: manga.title,
        thumbnailUrl: manga.thumbnailUrl,
        author: authors.join(', ') || undefined,
        artist: artists.join(', ') || undefined,
        description: doc.selectFirst('.wordbreak')?.text(),
        genres: doc.select('#tags li.tag a').map((a) => a.text()),
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { doc, url } = await open(`${BASE_URL}/series/detail/${idOf(manga.url)}`);
      // A single chapter redirects to book/detail/<id>.
      if (url.replace(/^https?:\/\/[^/]+/, '').startsWith('/book/')) {
        return [{ url: url.slice(url.lastIndexOf('/') + 1), name: doc.selectFirst('.GA4_booktitle')?.text() ?? manga.title, number: 1 }];
      }
      return doc.select('.itemList li').map((li) => {
        const href = li.selectFirst('a')?.attr('href') ?? '';
        return { url: href.slice(href.lastIndexOf('/') + 1), name: li.selectFirst('.title')?.text() ?? '' };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { doc } = await open(`https://vw.mangaz.com/virgo/view/${chapter.url}`);
      const encoded = doc.selectFirst('#doc')?.text() ?? '';
      const viewer = JSON.parse(utf8.decode(Array.from(base64.decodeBytes(encoded)))) as {
        Location: { base: string; scramble_dir: string };
        Orders: { no: number; name: string; scramble: { w: number; h: number; crops: { x: number; y: number; x2: number; y2: number; w: number; h: number }[] } }[];
      };
      const dir = viewer.Location.base + viewer.Location.scramble_dir;
      return [...viewer.Orders]
        .sort((a, b) => a.no - b.no)
        .map((order, index) => {
          const s = order.scramble;
          // w,h;x,y,x2,y2,w,h;...
          const encodedCrops = [`${s.w},${s.h}`, ...s.crops.map((c) => [c.x, c.y, c.x2, c.y2, c.w, c.h].join(','))].join(';');
          return { index, imageUrl: `${dir}/${order.name}#${encodedCrops}` };
        });
    },
    imageHeaders: () => headers,
    /** Images are strips of shuffled tiles: each crop copies (x2, y2) of the strip to (x, y) of the page. */
    transformImage(page: Page): ImageTransform {
      const fragment = (page.imageUrl ?? '').split('#')[1];
      if (!fragment) return {};
      const [size, ...crops] = fragment.split(';');
      const [width, height] = size!.split(',').map(Number) as [number, number];
      const ops: TileOp[] = crops.map((c) => {
        const [x, y, x2, y2, w, h] = c.split(',').map(Number) as [number, number, number, number, number, number];
        return { sx: x2, sy: y2, w, h, dx: x, dy: y };
      });
      return { tiles: { width, height, ops } };
    },
    resolveUrl(url: string): MangaSummary | null {
      const id = /\/series\/detail\/(\d+)/.exec(url)?.[1];
      return hostOf(url).endsWith('mangaz.com') && id ? { url: `/series/detail/${id}`, title: '' } : null;
    },
    getWebUrl: (item) => ('name' in item ? `https://vw.mangaz.com/virgo/view/${item.url}` : BASE_URL + item.url),
  }),
});
