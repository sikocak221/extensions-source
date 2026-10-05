import {
  type Chapter,
  type Filter,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf } from './common/utils';

const BASE_URL = 'https://manhua.zaimanhua.com';
const MOBILE_URL = 'https://m.zaimanhua.com';
const API_URL = 'https://v4api.zaimanhua.com/app/v1';
const ACCOUNT_API_URL = 'https://account-api.zaimanhua.com/v1';
const PAGE_SIZE = 20;

const USERNAME: Preference = { type: 'text', key: 'USERNAME', label: '用户名', default: '' };
const PASSWORD: Preference = { type: 'text', key: 'PASSWORD', label: '密码', default: '' };

const TIME: [string, string, [string, string][]] = [
  '榜单',
  'by_time',
  [
    ['不查看榜单', ''],
    ['日排行', '0'],
    ['周排行', '1'],
    ['月排行', '2'],
    ['总排行', '3'],
  ],
];
const STATUS: [string, string, [string, string][]] = [
  '进度',
  'status',
  [
    ['全部', '0'],
    ['连载中', '2309'],
    ['已完结', '2310'],
    ['短篇', '29205'],
  ],
];
const CATE: [string, string, [string, string][]] = [
  '读者群',
  'cate',
  [
    ['全部', '0'],
    ['少年漫画', '3262'],
    ['少女漫画', '3263'],
    ['青年漫画', '3264'],
    ['女青漫画', '13626'],
  ],
];
const ZONE: [string, string, [string, string][]] = [
  '地区',
  'zone',
  [
    ['全部', '0'],
    ['日本', '2304'],
    ['韩国', '2305'],
    ['欧美', '2306'],
    ['港台', '2307'],
    ['内地', '2308'],
    ['其他', '8435'],
  ],
];
const THEME: [string, string, [string, string][]] = [
  '题材',
  'theme',
  [
    ['全部', '0'],
    ['冒险', '4'],
    ['欢乐向', '5'],
    ['格斗', '6'],
    ['科幻', '7'],
    ['爱情', '8'],
    ['侦探', '9'],
    ['竞技', '10'],
    ['魔法', '11'],
    ['神鬼', '12'],
    ['校园', '13'],
    ['惊悚', '14'],
    ['其他', '16'],
    ['四格', '17'],
    ['亲情', '3242'],
    ['ゆり', '3243'],
    ['秀吉', '3244'],
    ['悬疑', '3245'],
    ['纯爱', '3246'],
    ['热血', '3248'],
    ['泛爱', '3249'],
    ['历史', '3250'],
    ['战争', '3251'],
    ['萌系', '3252'],
    ['宅系', '3253'],
    ['治愈', '3254'],
    ['励志', '3255'],
    ['武侠', '3324'],
    ['机战', '3325'],
    ['音乐舞蹈', '3326'],
    ['美食', '3327'],
    ['职场', '3328'],
    ['西方魔幻', '3365'],
    ['高清单行', '4459'],
    ['TS', '4518'],
    ['东方', '5077'],
    ['魔幻', '5806'],
    ['奇幻', '5848'],
    ['节操', '6219'],
    ['轻小说', '6316'],
    ['颜艺', '6437'],
    ['搞笑', '7568'],
    ['仙侠', '7900'],
    ['舰娘', '13627'],
    ['动画', '17192'],
    ['AA', '18522'],
    ['福瑞', '23323'],
    ['生存', '23388'],
    ['日常', '30788'],
    ['画集', '31137'],
  ],
];
const RANK_SORT: [string, string, [string, string][]] = [
  '排序',
  'rank_type',
  [
    ['人气', '0'],
    ['吐槽', '1'],
    ['订阅', '2'],
  ],
];
const SORT_TYPE: [string, string, [string, string][]] = [
  '排序',
  'sortType',
  [
    ['更新排序', '1'],
    ['人气排序', '2'],
  ],
];

type Tuple = [string, string, [string, string][]];

const baseHeaders = { 'User-Agent': USER_AGENT };

async function getToken(): Promise<string> {
  const username = prefs.get<string>(USERNAME.key) ?? '';
  const password = prefs.get<string>(PASSWORD.key) ?? '';
  if (!username.trim() || !password.trim()) return '';
  const login = `${username}\n${password}`;
  const saved = await storage.get<{ login: string; token: string }>('token');
  if (saved?.login === login) return saved.token;
  const response = await http.post<{ data: { user?: { token: string }; userInfo?: { token: string } } }>(
    `${ACCOUNT_API_URL}/login/passwd`,
    { form: { username, passwd: crypto.md5(password) } },
    { headers: baseHeaders, responseType: 'json' },
  );
  const token = response.body.data.user?.token ?? response.body.data.userInfo?.token ?? '';
  if (token) await storage.set('token', { login, token });
  return token;
}

async function headers(platform?: string): Promise<Record<string, string>> {
  const token = await getToken();
  return {
    ...baseHeaders,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(platform ? { Platform: platform } : {}),
  };
}

interface Response<T> {
  errno?: number;
  errmsg?: string;
  data: T;
}

async function api<T>(url: string, platform?: string): Promise<T> {
  const response = await http.get<Response<T>>(url, { headers: await headers(platform), responseType: 'json' });
  if (response.body.errmsg?.trim()) throw new Error(response.body.errmsg);
  return response.body.data;
}

/** `{ data: { data: T } }` (the detail objects are also called "comicInfo"). */
const unwrap = <T>(wrapper: { data?: T; comicInfo?: T } | undefined): T => {
  const value = wrapper?.data ?? wrapper?.comicInfo;
  if (!value) throw new Error('Empty response');
  return value;
};

interface Tag {
  tag_name: string;
}

interface MangaDto {
  id: number;
  title: string;
  cover?: string | null;
  description?: string | null;
  types?: Tag[] | null;
  status?: Tag[] | null;
  authors?: Tag[] | null;
}

interface ItemDto {
  id?: number | null;
  comic_id?: number | null;
  name?: string;
  title?: string;
  authors?: string | null;
  status?: string | null;
  cover?: string | null;
  types?: string | null;
}

const parseStatus = (status: string): MangaStatus =>
  status === '连载中' ? 'ongoing' : status === '已完结' ? 'completed' : 'unknown';

const formatList = (text: string | null | undefined) => (text ?? '').replace(/\//g, ', ');

function formatChapterName(name: string): string {
  const match = /^(?:连载版?)?(\d[.\d]*)([话卷])?$/.exec(name);
  return match ? `第${match[1]}${match[2] || '话'}` : name;
}

const itemSummary = (item: ItemDto): MangaSummary => ({
  url: `/${(item.comic_id || item.id)!}`,
  title: (item.name ?? item.title) as string,
  thumbnailUrl: item.cover || undefined,
});

function toMangasPage(
  data: {
    list?: ItemDto[] | null;
    comicList?: ItemDto[] | null;
    page?: number | null;
    size?: number | null;
    total?: number;
    totalNum?: number;
  },
  page: number,
): MangaPage {
  const list = data.list ?? data.comicList;
  if (!list?.length) throw new Error('漫画结果为空，请检查输入');
  const total = data.total ?? data.totalNum ?? 0;
  return { items: list.map(itemSummary), hasNextPage: (data.page ?? page) * (data.size ?? PAGE_SIZE) < total };
}

async function parseMangaList(url: string): Promise<MangaPage> {
  const list = await api<ItemDto[] | null>(url);
  if (!list?.length) throw new Error('没有更多结果了');
  return { items: list.map(itemSummary), hasNextPage: true };
}

const idOf = (url: string) => url.replace(/^\/+/, '').split('/')[0] ?? '';
const detailUrl = (id: string) => `${API_URL}/comic/detail/${id}?_v=2.2.5`;

const select = ([label, key, options]: Tuple, prefix: string): Filter => ({
  type: 'select',
  id: `${prefix}.${key}`,
  label,
  options: options.map(([l, value]) => ({ label: l, value })),
  default: options[0]![1],
});

const queryOf = (filters: Record<string, unknown>, prefix: string, tuples: Tuple[]) =>
  tuples
    .map(([, key]) => [key, filters[`${prefix}.${key}`]] as const)
    .filter(([, value]) => typeof value === 'string' && value)
    .map(([key, value]) => `${key}=${encodeURIComponent(value as string)}`);

export default defineExtension({
  preferences: () => [USERNAME, PASSWORD],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => parseMangaList(`${API_URL}/comic/rank/list?tag_id=0&page=${page}`),
    getLatest: (page) => parseMangaList(`${API_URL}/comic/update/list/0/${page}`),
    async search(query, page, filters): Promise<MangaPage> {
      const byTime = typeof filters['rank.by_time'] === 'string' ? filters['rank.by_time'] : '';
      if (!query.trim() && byTime) {
        const qs = ['tag_id=0', ...queryOf(filters, 'rank', [TIME, RANK_SORT]), `page=${page}`].join('&');
        return parseMangaList(`${API_URL}/comic/rank/list?${qs}`);
      }
      if (!query.trim()) {
        const qs = [
          `size=${PAGE_SIZE}`,
          ...queryOf(filters, 'genre', [SORT_TYPE, STATUS, CATE, ZONE, THEME]),
          `page=${page}`,
        ].join('&');
        return toMangasPage(await api(`${API_URL}/comic/filter/list?${qs}`), page);
      }
      if (filters.byId === true && /^\d+$/.test(query.trim()) && Number(query) > 0) {
        const manga = unwrap(await api<{ data?: MangaDto }>(detailUrl(query.trim())));
        return {
          items: [{ url: `/${manga.id}`, title: manga.title, thumbnailUrl: manga.cover || undefined }],
          hasNextPage: false,
        };
      }
      return toMangasPage(
        await api(
          `${API_URL}/search/index?source=0&size=${PAGE_SIZE}&keyword=${encodeURIComponent(query)}&page=${page}`,
        ),
        page,
      );
    },
    getFilters: (): Filter[] => [
      { type: 'checkbox', id: 'byId', label: '启用ID跳转（搜索纯数字时）' },
      { type: 'header', label: '排行榜（搜索时无效）' },
      {
        type: 'select',
        id: 'rank.by_time',
        label: TIME[0],
        options: TIME[2].map(([l, value]) => ({ label: l, value })),
        default: '',
      },
      select(RANK_SORT, 'rank'),
      { type: 'separator' },
      { type: 'header', label: '分类(搜索/查看排行榜时无效)' },
      select(SORT_TYPE, 'genre'),
      select(STATUS, 'genre'),
      select(CATE, 'genre'),
      select(ZONE, 'genre'),
      select(THEME, 'genre'),
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const data = unwrap(await api<{ data?: MangaDto }>(detailUrl(idOf(manga.url))));
      return {
        url: `/${data.id}`,
        title: data.title,
        author: data.authors?.map((a) => a.tag_name).join(', '),
        description: data.description ?? undefined,
        genres: data.types?.map((t) => t.tag_name),
        status: parseStatus(data.status?.[0]?.tag_name ?? ''),
        thumbnailUrl: data.cover ?? manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      interface ChapterData {
        id: number;
        last_update_chapter_id?: number;
        lastUpdateChapterId?: number;
        last_updatetime?: number;
        lastUpdateTime?: number;
        chapters?: ChapterGroup[];
        chapterList?: ChapterGroup[];
        isHideChapter?: number | null;
        canRead?: boolean | null;
      }
      interface ChapterGroup {
        title: string;
        data: { chapter_id: number; chapter_title: string; updatetime?: number | null }[];
      }
      const id = idOf(manga.url);
      let data = unwrap(await api<{ data?: ChapterData }>(detailUrl(id), 'pc'));
      if (data.isHideChapter === 1 && data.canRead === true)
        data = unwrap(await api<{ data?: ChapterData }>(`${BASE_URL}/api/v1/comic2/comic/detail?id=${id}`, 'pc'));
      const groups = data.chapters ?? data.chapterList;
      if (!groups?.length) throw new Error('章节列表为空，用户权限不足或漫画不存在');
      const lastChapter = String(data.last_update_chapter_id ?? data.lastUpdateChapterId ?? '');
      const lastTime = (data.last_updatetime ?? data.lastUpdateTime ?? 0) * 1000;
      const now = Date.now();
      return groups.flatMap((group) =>
        group.data.map((c): Chapter => {
          let uploadedAt = (c.updatetime ?? 0) * 1000;
          // Some chapters always answer the current time: ignore it, except for the latest chapter.
          if (now - uploadedAt < 10_000) uploadedAt = String(c.chapter_id) === lastChapter ? lastTime : 0;
          return {
            url: `/${id}/${c.chapter_id}`,
            name: formatChapterName(c.chapter_title),
            scanlator: group.title,
            uploadedAt: uploadedAt || undefined,
          };
        }),
      );
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [mangaId, chapterId] = chapter.url.replace(/^\/+/, '').split('/');
      const data = unwrap(
        await api<{ data?: { page_url_hd: string[]; canRead: boolean } }>(
          `${API_URL}/comic/chapter/${mangaId}/${chapterId}?_v=2.2.5`,
          'h5',
        ),
      );
      if (!data.canRead) throw new Error('用户权限不足，请提升用户等级');
      return data.page_url_hd.map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => baseHeaders,
    getWebUrl(item) {
      const [mangaId, chapterId] = item.url.replace(/^\/+/, '').split('/');
      return chapterId
        ? `${MOBILE_URL}/pages/comic/page?comic_id=${mangaId}&chapter_id=${chapterId}`
        : `${MOBILE_URL}/pages/comic/detail?id=${mangaId}`;
    },
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)\/pages\/comic\/detail\?(?:[^#]*&)?id=(\d+)/i.exec(url.trim());
      if (!match || hostOf(`https://${match[1]}`) !== hostOf(MOBILE_URL)) return null;
      return { url: `/${match[2]}`, title: '' };
    },
  }),
});
