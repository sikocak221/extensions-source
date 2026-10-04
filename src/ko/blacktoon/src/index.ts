import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, parseDate } from './common/utils';

// blacktoon.me redirects to the current domain (blacktoon423.com …): the first request finds it out.
const BASE_URL = 'https://blacktoon.me';
const PAGE_SIZE = 24;

const PLATFORMS: Record<number, string> = {
  1: '네이버',
  2: '다음',
  3: '카카오',
  4: '레진',
  5: '투믹스',
  6: '탑툰',
  7: '코미카',
  8: '배틀코믹',
  9: '코믹GT',
  10: '케이툰',
  11: '애니툰',
  12: '폭스툰',
  13: '피너툰',
  14: '봄툰',
  15: '코미코',
  16: '무툰',
  17: '지존신마',
  99: '기타',
};

const TAGS: Record<number, string> = {
  1: '학원',
  2: '액션',
  3: 'SF',
  4: '스토리',
  5: '판타지',
  6: 'BL/백합',
  7: '개그/코미디',
  8: '연애/순정',
  9: '드라마',
  10: '로맨스',
  11: '시대극',
  12: '스포츠',
  13: '일상',
  14: '추리/미스터리',
  15: '공포/스릴러',
  16: '성인',
  17: '옴니버스',
  18: '에피소드',
  19: '무협',
  20: '소년',
  99: '기타',
};

const PUBLISH_DAYS: Record<number, string> = {
  1: '월',
  2: '화',
  3: '수',
  4: '목',
  5: '금',
  6: '토',
  7: '일',
  10: '열흘',
};

interface SeriesDto {
  x: string;
  t: string;
  p?: string;
  au?: string;
  g?: number | string;
  tag?: string;
  c?: string;
  pd?: string;
  h?: number | string;
}

interface Series {
  id: string;
  name: string;
  poster: string;
  author: string;
  updatedAt: number;
  tags: number[];
  platform: number;
  publishDay: number;
  hot: number;
  /** 0 = completed list, 1 = ongoing list. */
  listIndex: number;
}

interface ChapterDto {
  id: string;
  t: string;
  d?: string;
}

interface Hosts {
  base: string;
  toonList: string;
  webtoon: string;
  image: string;
}

let currentBase = BASE_URL;
let hostsCache: Promise<Hosts> | undefined;
let dbCache: Promise<Series[]> | undefined;

const headers = (base: string) => ({ 'User-Agent': USER_AGENT, Referer: `${base}/`, Origin: base });

// Data scripts, chapter lists and images are served from separate hosts that the site declares in
// inline scripts (inc_url1/inc_url2) and /data/config.js (img_domain).
function getHosts(): Promise<Hosts> {
  return (hostsCache ??= (async () => {
    const home = await http.get(BASE_URL, { headers: { 'User-Agent': USER_AGENT } });
    const base = (currentBase = /^https?:\/\/[^/?#]+/i.exec(home.url)?.[0] ?? BASE_URL);
    const config = await http.get(`${base}/data/config.js`, { headers: headers(base) });
    const toonList = /inc_url1\s*=\s*"([^"]+)"/.exec(home.body)?.[1];
    const webtoon = /inc_url2\s*=\s*"([^"]+)"/.exec(home.body)?.[1];
    const image = /var img_domain\s*=\s*"([^"]+)"/.exec(config.body)?.[1];
    if (!toonList || !webtoon || !image) throw new Error('unable to read the site hosts');
    return { base, toonList, webtoon, image: `${image.replace(/\/$/, '')}/` };
  })().catch((error) => {
    hostsCache = undefined;
    throw error;
  }));
}

const jsData = <T>(body: string): T => JSON.parse(body.slice(body.indexOf(' = ') + 3).replace(/;\s*$/, '')) as T;

function getDb(): Promise<Series[]> {
  return (dbCache ??= (async () => {
    const hosts = await getHosts();
    const series: Series[] = [];
    for (const listIndex of [0, 1]) {
      const response = await http.get(`${hosts.webtoon}/webtoon_${listIndex}.js`, { headers: headers(hosts.base) });
      for (const dto of jsData<SeriesDto[]>(response.body)) {
        series.push({
          id: dto.x,
          name: dto.t,
          poster: dto.p ?? '',
          author: dto.au ?? '',
          updatedAt: Number(dto.g ?? 0),
          tags: (dto.tag ?? '')
            .split(',')
            .filter((t) => t.trim())
            .map(Number),
          platform: Number(dto.c ?? -1),
          publishDay: Number(dto.pd ?? -1),
          hot: Number(dto.h ?? 0),
          listIndex,
        });
      }
      await timers.sleep(0);
    }
    return series;
  })().catch((error) => {
    dbCache = undefined;
    throw error;
  }));
}

const mangaId = (manga: MangaSummary) => /\/webtoon\/(\d+)/.exec(manga.url)?.[1] ?? manga.url;

async function chunk(list: Series[], page: number): Promise<MangaPage> {
  const { image } = await getHosts();
  return {
    items: list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((s): MangaSummary => ({
      url: `/webtoon/${s.id}.html`,
      title: s.name,
      thumbnailUrl: s.poster.trim() ? image + s.poster.replace('_x4', '').replace('_x3', '') : undefined,
    })),
    hasNextPage: page * PAGE_SIZE < list.length,
  };
}

const options = (map: Record<number, string>, first?: { value: string; label: string }) => [
  ...(first ? [first] : []),
  ...Object.entries(map).map(([value, label]) => ({ value, label })),
];

function applyFilters(list: Series[], filters: FilterState): Series[] {
  let result = list;
  const platform = typeof filters.platform === 'string' ? Number(filters.platform) : -1;
  if (platform !== -1) result = result.filter((s) => s.platform === platform);
  const day = typeof filters.day === 'string' ? Number(filters.day) : -1;
  if (day !== -1) result = result.filter((s) => s.publishDay === day);
  const status = typeof filters.status === 'string' ? Number(filters.status) : -1;
  if (status === 0 || status === 1) result = result.filter((s) => s.listIndex === status);
  for (const [key, value] of Object.entries(filters)) {
    if (!key.startsWith('tag-')) continue;
    const id = Number(key.slice(4));
    if (value === 'include') result = result.filter((s) => s.tags.includes(id));
    else if (value === 'exclude') result = result.filter((s) => !s.tags.includes(id));
  }
  return filters.order === '1'
    ? [...result].sort((a, b) => b.hot - a.hot)
    : [...result].sort((a, b) => b.updatedAt - a.updatedAt);
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(page): Promise<MangaPage> {
      return chunk(
        [...(await getDb())].sort((a, b) => b.hot - a.hot),
        page,
      );
    },
    async getLatest(page): Promise<MangaPage> {
      return chunk(
        [...(await getDb())].sort((a, b) => b.updatedAt - a.updatedAt),
        page,
      );
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'order',
        label: 'Order by',
        options: [
          { value: '0', label: '최신순' },
          { value: '1', label: '인기순' },
        ],
        default: '0',
      },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [
          { value: '-1', label: 'All' },
          { value: '1', label: '연재' },
          { value: '0', label: '완결' },
        ],
        default: '-1',
      },
      {
        type: 'select',
        id: 'platform',
        label: 'Platform',
        options: options(PLATFORMS, { value: '-1', label: '' }),
        default: '-1',
      },
      {
        type: 'select',
        id: 'day',
        label: 'Publishing Day',
        options: options(PUBLISH_DAYS, { value: '-1', label: '' }),
        default: '-1',
      },
      {
        type: 'group',
        id: 'tags',
        label: 'Tag',
        filters: Object.entries(TAGS).map(([id, label]) => ({ type: 'tristate', id: `tag-${id}`, label })),
      },
    ],
    async search(query, page, filters): Promise<MangaPage> {
      let list = await getDb();
      const needle = query.trim().toLowerCase();
      if (needle)
        list = list.filter((s) => s.name.toLowerCase().includes(needle) || s.author.toLowerCase().includes(needle));
      return chunk(applyFilters(list, filters), page);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const hosts = await getHosts();
      const id = mangaId(manga);
      const series = (await getDb()).find((s) => s.id === id);
      const response = await http.get(`${hosts.base}/webtoon/${id}.html`, { headers: headers(hosts.base) });
      const document = html.load(response.body, { baseUrl: response.url });
      const status: MangaStatus = series ? (series.listIndex === 0 ? 'completed' : 'ongoing') : 'unknown';
      const genres = series
        ? [PLATFORMS[series.platform], PUBLISH_DAYS[series.publishDay], ...series.tags.map((t) => TAGS[t])].filter(
            (g): g is string => !!g,
          )
        : [];
      const poster = document.selectFirst('img.thumb2[o_src]')?.attr('o_src');
      return {
        url: manga.url,
        title: series?.name ?? manga.title,
        description: document.select('p.mt-2').pop()?.text() || undefined,
        thumbnailUrl: poster ? hosts.image + poster : manga.thumbnailUrl,
        author: series?.author || undefined,
        genres: genres.length ? genres : undefined,
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const hosts = await getHosts();
      const id = mangaId(manga);
      const response = await http.get(`${hosts.toonList}/data/toonlist/${id}.js`, { headers: headers(hosts.base) });
      return jsData<ChapterDto[]>(response.body)
        .map((chapter) => ({
          url: `/webtoons/${id}/${chapter.id}.html`,
          name: chapter.t,
          uploadedAt: parseDate((chapter.d ?? '').split(' ')[0], 'yyyy-M-d'),
        }))
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const hosts = await getHosts();
      const response = await http.get(`${hosts.base}${chapter.url}`, { headers: headers(hosts.base) });
      const document = html.load(response.body, { baseUrl: response.url });
      return document
        .select('#toon_content_imgs img')
        .map((img, index) => ({ index, imageUrl: hosts.image + (img.attr('o_src') ?? '') }));
    },
    imageHeaders: () => headers(currentBase),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/blacktoon[^/]*\/webtoons?\/(\d+)/i.exec(url.trim());
      return match ? { url: `/webtoon/${match[1]}.html`, title: '' } : null;
    },
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
