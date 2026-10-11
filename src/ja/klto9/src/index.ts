import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type SortValue,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://klto9.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const GENRES = [
  'Action',
  'Adult',
  'Adventure',
  'Anime',
  'Comedy',
  'Comic',
  'Doujinshi',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Gender Bender',
  'Harem',
  'Historical',
  'Horror',
  'Josei',
  'Live action',
  'Magic',
  'Manhua',
  'Manhwa',
  'Martial Arts',
  'Mature',
  'Mecha',
  'Mystery',
  'One shot',
  'Psychological',
  'Romance',
  'School Life',
  'Sci-fi',
  'Seinen',
  'Shoujo',
  'Shoujo Ai',
  'Shounen',
  'Shounen Ai',
  'Slice of life',
  'Smut',
  'Soft Yaoi',
  'Soft Yuri',
  'Sports',
  'Supernatural',
  'Comic Magazine',
  'Tragedy',
  'Color Manga',
  'Manga scan',
  'VnComic',
  'Webtoon',
];
const STATUS: [string, string][] = [
  ['Anything', ''],
  ['Translating', '2'],
  ['Complete', '1'],
  ['Pause', '3'],
];
const SORTS: [string, string][] = [
  ['Name', 'name'],
  ['Most Views', 'views'],
  ['Last update', 'last_update'],
];

type Doc = ReturnType<typeof html.load>;
async function load(url: string) {
  const res = await http.get(url, { headers });
  return { doc: html.load(res.body, { baseUrl: res.url }), body: res.body };
}

const randomString = (n: number) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
};

function parsePage(doc: Doc): MangaPage {
  const items: MangaSummary[] = [];
  for (const el of doc.select('div.thumb-item-flow')) {
    const a = el.selectFirst('div.thumb_attr.series-title a') ?? el.selectFirst('a');
    if (!a) continue;
    const bgEl = el.selectFirst('div.content.img-in-ratio');
    let thumb = bgEl?.absUrl('data-bg');
    if (!thumb) {
      const m = /url\(['"]?([^'"]+)['"]?\)/.exec(bgEl?.attr('style') ?? '');
      thumb = m ? absoluteUrl(BASE_URL, m[1]!) : undefined;
    }
    items.push({ url: relativeUrl(a.absUrl('href') ?? ''), title: a.text().trim(), thumbnailUrl: thumb });
  }
  return {
    items,
    hasNextPage: doc.select('ul.pagination li a[href]').some((a) => a.text().includes('»')),
  };
}

const listUrl = (page: number, sort: string, type: string) =>
  `${BASE_URL}/manga-list.html?listType=pagination&page=${page}&sort=${sort}&sort_type=${type}`;

function parseStatus(s: string | undefined): MangaStatus {
  const l = (s ?? '').toLowerCase();
  if (!l) return 'unknown';
  if (l.includes('ongoing') || l.includes('incomplete')) return 'ongoing';
  if (l.includes('complete')) return 'completed';
  if (l.includes('pause') || l.includes('hiatus')) return 'hiatus';
  return 'unknown';
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    imageHeaders: () => headers,
    async getPopular(page) {
      return parsePage((await load(listUrl(page, 'views', 'DESC'))).doc);
    },
    async getLatest(page) {
      return parsePage((await load(listUrl(page, 'last_update', 'DESC'))).doc);
    },
    getFilters(): Filter[] {
      return [
        {
          type: 'group',
          id: 'genres',
          label: 'Genres',
          filters: GENRES.map((g): Filter => ({ type: 'tristate', id: `genre.${g}`, label: g })),
        },
        {
          type: 'select',
          id: 'status',
          label: 'Status',
          options: STATUS.map(([label, value]) => ({ value, label })),
        },
        { type: 'text', id: 'author', label: 'Author' },
        { type: 'text', id: 'group', label: 'Scanlation Group' },
        {
          type: 'sort',
          id: 'sort',
          label: 'Sort by',
          options: SORTS.map(([label, value]) => ({ value, label })),
          default: { value: 'views', ascending: false },
        },
      ];
    },
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const q: string[] = ['listType=pagination', `page=${page}`];
      if (query) q.push(`name=${encodeURIComponent(query)}`);
      const include: string[] = [];
      const exclude: string[] = [];
      for (const [id, v] of Object.entries(filters)) {
        if (!id.startsWith('genre.')) continue;
        if (v === 'include') include.push(id.slice(6));
        if (v === 'exclude') exclude.push(id.slice(6));
      }
      if (typeof filters.status === 'string' && filters.status) q.push(`m_status=${filters.status}`);
      if (typeof filters.author === 'string' && filters.author) q.push(`author=${encodeURIComponent(filters.author)}`);
      if (typeof filters.group === 'string' && filters.group) q.push(`group=${encodeURIComponent(filters.group)}`);
      const sort = filters.sort as SortValue | undefined;
      q.push(`sort=${sort?.value ?? 'last_update'}`, `sort_type=${sort ? (sort.ascending ? 'ASC' : 'DESC') : 'DESC'}`);
      if (include.length) q.push(`genre=${encodeURIComponent(include.join(','))}`);
      if (exclude.length) q.push(`ungenre=${encodeURIComponent(exclude.join(','))}`);
      return parsePage((await load(`${BASE_URL}/manga-list.html?${q.join('&')}`)).doc);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { doc } = await load(absoluteUrl(BASE_URL, manga.url));
      const title = doc.selectFirst('ol.breadcrumb li[itemprop=itemListElement]:last-child span')?.text().trim();
      const info = doc.selectFirst('ul.manga-info');
      const details: MangaDetails = {
        url: manga.url,
        title: title ?? manga.title,
        thumbnailUrl: manga.thumbnailUrl,
        status: 'unknown',
      };
      if (!info) return details;
      const li = (needle: string) => info.select('li').find((l) => l.text().includes(needle));
      const names = li('Other name')?.text().split(':').slice(1).join(':').trim();
      let description = names ? `Other Names: ${names}\n\n` : '';
      const descRow = doc.select('div.row').find((r) => r.text().includes('Description'));
      const desc = descRow?.selectFirst('p')?.text().trim();
      if (desc && desc !== 'Updating') description += desc;
      return {
        ...details,
        author: /Author\(s\)<\/b>:\s*<small><a[^>]*>([^<]+)/.exec(info.html())?.[1],
        description,
        genres: li('Genre')
          ?.select('small a')
          .map((a) => a.text().trim()),
        status: parseStatus(li('Status')?.selectFirst('a')?.text().trim()),
        thumbnailUrl: doc.selectFirst('div.info-cover img.thumbnail')?.absUrl('src') ?? manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const slug = manga.url.split('teap-')[1]!.split('.html')[0]!;
      const res = await http.get<
        { id: string; chapter: string; name?: string | null; manga: string; last_update: string }[]
      >(`${BASE_URL}/${randomString(25)}.lst?manga=${encodeURIComponent(slug)}`, { headers, responseType: 'json' });
      return res.body.map((c) => {
        const num = c.chapter.replace(/\.0$/, '');
        const t = parseDate(c.last_update, 'yyyy-MM-dd HH:mm:ss');
        return {
          url: `/${c.id}#${c.manga}#${c.chapter}`,
          name: `Chapter ${num}${c.name ? ` - ${c.name}` : ''}`,
          number: parseFloat(c.chapter),
          uploadedAt: t === undefined ? undefined : Math.min(t, Date.now()),
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const cid = chapter.url.slice(1).split('#')[0]!;
      const { doc } = await load(`${BASE_URL}/${randomString(30)}.iog?cid=${encodeURIComponent(cid)}`);
      return doc.select('img').map((img, index) => ({
        index,
        imageUrl: img.absUrl('data-pagespeed-lazy-src') || img.absUrl('src') || '',
      }));
    },
    getWebUrl(item) {
      const parts = item.url.slice(1).split('#');
      if (parts.length >= 3) return `${BASE_URL}/zmqs-${parts[1]}-chapter-${parts[2]!.replace(/\.0$/, '')}.html`;
      return absoluteUrl(BASE_URL, item.url);
    },
  }),
});
