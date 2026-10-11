import {
  type Chapter,
  type Filter,
  type FilterState,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://manga-park.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const TYPES: [string, string, string][] = [
  ['(ランキング) 総合', 'ranking', 'all'],
  ['(ランキング) 女性', 'ranking', 'woman'],
  ['(ランキング) 男性', 'ranking', 'man'],
  ['(ランキング) 大人向け', 'ranking', 'adult'],
  ['月曜日', 'series', 'mon'],
  ['火曜日', 'series', 'tue'],
  ['水曜日', 'series', 'wed'],
  ['木曜日', 'series', 'thu'],
  ['金曜日', 'series', 'fri'],
  ['土曜日', 'series', 'sat'],
  ['日曜日', 'series', 'sun'],
  ['完', 'series', 'end'],
];

const load = async (url: string) => html.load((await http.get(url, { headers })).body, { baseUrl: url });

async function list(url: string): Promise<MangaPage> {
  const doc = await load(url);
  return {
    items: doc
      .select(
        'div.list div.rankingHome ul.common-list li a, div.list div.series div.titles li a, div.list div.search-result ul.common-list li a',
      )
      .map((a) => ({
        url: relativeUrl(a.absUrl('href') ?? ''),
        title: a.selectFirst('div.info h3')?.text() ?? '',
        thumbnailUrl: a.selectFirst('div.thumb > img')?.absUrl('src'),
      })),
    hasNextPage: false,
  };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: () => list(`${BASE_URL}/ranking?target=all`),
    getLatest: () => list(`${BASE_URL}/series`),
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'type',
        label: 'Filter by',
        options: TYPES.map(([label, type, value]) => ({ label, value: `${type}:${value}` })),
        default: 'ranking:all',
      },
    ],
    search(query: string, _page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) return list(`${BASE_URL}/search/freeword?key=${encodeURIComponent(query)}`);
      const [type, value] = (typeof filters.type === 'string' ? filters.type : 'ranking:all').split(':');
      return list(type === 'ranking' ? `${BASE_URL}/ranking?target=${value}` : `${BASE_URL}/series/${value}`);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const doc = await load(BASE_URL + manga.url);
      const info = doc.selectFirst('div.titleMain div.titleInfo');
      const statusText = info?.selectFirst('div.tag ul li a')?.text() ?? '';
      const status: MangaStatus = statusText.includes('完結')
        ? 'completed'
        : statusText.includes('更新')
          ? 'ongoing'
          : statusText.includes('休載中')
            ? 'hiatus'
            : 'unknown';
      return {
        url: manga.url,
        title: info?.selectFirst('h1')?.text() ?? manga.title,
        author: info?.selectFirst('p.author')?.text(),
        description: doc.selectFirst('p.explanation')?.text(),
        thumbnailUrl: doc.selectFirst('div.titleThumb img')?.absUrl('src') ?? manga.thumbnailUrl,
        genres: (info?.select('div.titleCategory ul li a') ?? []).map((a) => a.text()),
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const doc = await load(BASE_URL + manga.url);
      return doc
        .select('div.chapter ul li[data-chapter-id]')
        .map((li) => {
          const title = li.selectFirst('p.chapterTitle')?.text() ?? '';
          const free = li.selectFirst('div.free-badge img') !== null;
          return {
            url: `${li.attr('data-chapter-id')}#${manga.url}`,
            name: free ? `\u{1F193} ${title}` : title,
            number: Number.parseFloat(li.attr('data-chapter-name') ?? '') || undefined,
            uploadedAt: parseDate(li.selectFirst('div.date span')?.text(), 'yyyy/M/d'),
          };
        })
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const id = chapter.url.split('#')[0];
      let chapters: { images: { path: string; key: string }[] }[];
      try {
        const { body } = await http.get<{ data: { chapter: typeof chapters } }>(`${BASE_URL}/api/chapter/${id}`, {
          headers,
          responseType: 'json',
        });
        chapters = body.data.chapter;
        if (!Array.isArray(chapters)) throw new Error();
      } catch {
        throw new Error('You need to purchase this chapter.');
      }
      return chapters
        .flatMap((c) => c.images)
        .map((image, index) => ({ index, imageUrl: `${image.path}#${image.key}` }));
    },
    imageHeaders: () => headers,
    /** XOR with the (base64) key from the url fragment. */
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      const fragment = (page.imageUrl ?? '').split('#')[1];
      if (!fragment) return {};
      const key = base64.decodeBytes(decodeURIComponent(fragment));
      if (!key.length) return {};
      const out = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) out[i] = bytes[i]! ^ key[i % key.length]!;
      return { bytes: out };
    },
    resolveUrl(url: string): MangaSummary | null {
      const path = relativeUrl(url.replace(/[?#].*/, ''));
      return hostOf(url) === hostOf(BASE_URL) && /^\/title\/[^/]+/.test(path) ? { url: path, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + ('name' in item ? (item.url.split('#')[1] ?? '') : item.url),
  }),
});
