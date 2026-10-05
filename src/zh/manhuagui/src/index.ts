import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { ownText, parseDate } from './common/utils';
import { decompressFromBase64 } from './lzstring';
import { unpack } from './packer';

const MIRRORS = [
  'https://www.manhuagui.com',
  'https://tw.manhuagui.com',
  'https://www.mhgui.com',
  'https://tw.mhgui.com',
];
const MIRROR_PREF = 'mirror';
const R18_PREF = 'showR18';
const IMAGE_SERVER = 'https://i.hamreus.com';
const RANK_PREFIX = 'rank_';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const baseUrl = () => {
  const mirror = prefs.get<string>(MIRROR_PREF);
  return mirror && MIRRORS.includes(mirror) ? mirror : MIRRORS[0]!;
};
const showR18 = () => prefs.get<boolean>(R18_PREF) === true;
const headers = () => ({
  'User-Agent': USER_AGENT,
  'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: `${baseUrl()}/`,
  ...(showR18() ? { Cookie: 'isAdult=1' } : {}),
});

async function load(path: string): Promise<{ document: HtmlElement; url: string }> {
  const response = await http.get(path.startsWith('http') ? path : baseUrl() + path, { headers: headers() });
  return { document: html.load(response.body, { baseUrl: response.url }), url: response.url };
}

function mangaList(document: HtmlElement): MangaPage {
  const items = document.select('ul#contList > li').flatMap((li): MangaSummary[] => {
    const a = li.selectFirst('a.bcover');
    if (!a) return [];
    const img = a.selectFirst('img');
    return [
      {
        url: a.attr('href') ?? '',
        title: a.attr('title') ?? '',
        thumbnailUrl: (img?.attr('src') ? img.absUrl('src') : img?.absUrl('data-src')) || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('span.current + a') !== null };
}

const pathOrEmpty = (value: string, prefix = '/', suffix = '') => (value ? `${prefix}${value}${suffix}` : '');

const select = (id: string, label: string, options: [string, string][]): Filter => ({
  type: 'select',
  id,
  label,
  default: options[0]![1],
  options: options.map(([l, value]) => ({ label: l, value })),
});

const YEARS: [string, string][] = [
  ['全部', ''],
  ...Array.from({ length: 16 }, (_, i): [string, string] => [`${2025 - i}年`, String(2025 - i)]),
  ['00年代', '200x'],
  ['90年代', '199x'],
  ['80年代', '198x'],
  ['更早', '197x'],
];

const FILTERS: Filter[] = [
  select('sort', '排序方式', [
    ['人气最旺', 'view'],
    ['最新发布', ''],
    ['最新更新', 'update'],
    ['评分最高', 'rate'],
    ['日排行', RANK_PREFIX],
    ['周排行', `${RANK_PREFIX}week`],
    ['月排行', `${RANK_PREFIX}month`],
    ['总排行', `${RANK_PREFIX}total`],
  ]),
  select('locale', '按地区', [
    ['全部', ''],
    ['日本', 'japan'],
    ['港台', 'hongkong'],
    ['其它', 'other'],
    ['欧美', 'europe'],
    ['内地', 'china'],
    ['韩国', 'korea'],
  ]),
  select(
    'genre',
    '按剧情',
    (
      '全部:,热血:rexue,冒险:maoxian,魔幻:mohuan,神鬼:shengui,搞笑:gaoxiao,萌系:mengxi,爱情:aiqing,科幻:kehuan,' +
      '魔法:mofa,格斗:gedou,武侠:wuxia,机战:jizhan,战争:zhanzheng,竞技:jingji,体育:tiyu,校园:xiaoyuan,生活:shenghuo,' +
      '励志:lizhi,历史:lishi,伪娘:weiniang,宅男:zhainan,腐女:funv,耽美:danmei,百合:baihe,后宫:hougong,治愈:zhiyu,' +
      '美食:meishi,推理:tuili,悬疑:xuanyi,恐怖:kongbu,四格:sige,职场:zhichang,侦探:zhentan,社会:shehui,音乐:yinyue,' +
      '舞蹈:wudao,杂志:zazhi,黑道:heidao'
    )
      .split(',')
      .map((pair) => pair.split(':') as [string, string]),
  ),
  select('reader', '按受众', [
    ['全部', ''],
    ['少女', 'shaonv'],
    ['少年', 'shaonian'],
    ['青年', 'qingnian'],
    ['儿童', 'ertong'],
    ['通用', 'tongyong'],
  ]),
  select('year', '按年份', YEARS),
  select('letter', '按字母', [
    ['全部', ''],
    ...'abcdefghijklmnopqrstuvwxyz'.split('').map((c): [string, string] => [c.toUpperCase(), c]),
    ['0-9', '0-9'],
  ]),
  select('status', '按进度', [
    ['全部', ''],
    ['连载', 'lianzai'],
    ['完结', 'wanjie'],
  ]),
];

function chapterList(document: HtmlElement): Chapter[] {
  const hidden = document.selectFirst('#__VIEWSTATE');
  let root = document;
  if (hidden) {
    if (!showR18()) throw new Error('您需要在设置中打开R18作品显示开关才能阅读此作品');
    root = html.load(decompressFromBase64(hidden.attr('value') ?? ''));
  }
  const latestHref = document.selectFirst('div.book-detail > ul.detail-list > li.status > span > a.blue')?.attr('href');
  const latestDate = document.select('div.book-detail > ul.detail-list > li.status > span > span.red').at(-1)?.text();
  const chapters: Chapter[] = [];
  for (const section of root.select('[id^=chapter-list-]')) {
    for (const list of section.select('ul').reverse()) {
      for (const a of list.select('li > a.status0')) {
        const url = a.attr('href') ?? '';
        chapters.push({
          url,
          name: a.attr('title') || ownText(a.selectFirst('span')),
          uploadedAt: url === latestHref ? parseDate(latestDate, 'yyyy-MM-dd') : undefined,
        });
      }
    }
  }
  return chapters;
}

interface Comic {
  files?: string[];
  path?: string;
  sl?: { e?: number; m?: string };
}

export default defineExtension({
  preferences: () => [
    {
      type: 'select',
      key: MIRROR_PREF,
      label: '镜像网址',
      options: MIRRORS.map((url) => ({ label: url.replace('https://', ''), value: url })),
      default: MIRRORS[0]!,
    },
    {
      type: 'switch',
      key: R18_PREF,
      label: '显示R18作品',
      description: '请确认您的IP不在漫画柜的屏蔽列表内，例如中国大陆IP。',
      default: false,
    },
  ],
  createSource: () => ({
    get baseUrl() {
      return baseUrl();
    },
    getPopular: async (page) => mangaList((await load(`/list/view_p${page}.html`)).document),
    getLatest: async (page) => mangaList((await load(`/list/update_p${page}.html`)).document),
    getFilters: () => FILTERS,
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const value = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');
      let url: string;
      if (query) url = `/s/${encodeURIComponent(query)}_p${page}.html`;
      else {
        const params = ['locale', 'genre', 'reader', 'year', 'letter', 'status'].map(value).filter(Boolean).join('_');
        const sort = value('sort');
        if (!sort) url = `/list${pathOrEmpty(params)}/index_p${page}.html`;
        else if (sort.startsWith(RANK_PREFIX)) {
          const rank = `/rank${pathOrEmpty(params)}`;
          const period = sort.slice(RANK_PREFIX.length);
          url = rank.endsWith('rank')
            ? `${rank}/${pathOrEmpty(period, '', '.html')}`
            : `${rank}${pathOrEmpty(period, '_')}.html`;
        } else url = `/list${pathOrEmpty(params)}/${sort}_p${page}.html`;
      }
      const { document, url: finalUrl } = await load(url);
      const path = finalUrl.replace(/^https?:\/\/[^/]+/, '');
      if (path.startsWith('/s/')) {
        const items = document.select('div.book-result > ul > li').flatMap((li): MangaSummary[] => {
          const a = li.selectFirst('div.book-detail dl > dt > a');
          if (!a) return [];
          return [
            {
              url: a.attr('href') ?? '',
              title: a.attr('title') ?? '',
              thumbnailUrl: li.selectFirst('div.book-cover > a.bcover > img')?.absUrl('src') || undefined,
            },
          ];
        });
        return { items, hasNextPage: document.selectFirst('span.current + a') !== null };
      }
      if (path.startsWith('/rank/')) {
        const items = document.select('td.rank-title a').map((a) => ({ url: a.attr('href') ?? '', title: a.text() }));
        return { items, hasNextPage: false };
      }
      return mangaList(document);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(manga.url);
      const names = (labels: string) =>
        document
          .select(
            labels
              .split(',')
              .map((l) => `span:contains(${l}) > a`)
              .join(', '),
          )
          .map((a) => a.text());
      const statusText = document.selectFirst('div.book-detail > ul.detail-list > li.status > span > span')?.text();
      const status: MangaStatus = ['连载中', '連載中'].includes(statusText ?? '')
        ? 'ongoing'
        : ['已完结', '已完結'].includes(statusText ?? '')
          ? 'completed'
          : 'unknown';
      const authors = names('漫画作者,漫畫作者');
      return {
        url: manga.url,
        title: document.selectFirst('div.book-title > h1')?.text() || manga.title,
        description: document.selectFirst('div#intro-all')?.text() || undefined,
        thumbnailUrl: document.selectFirst('p.hcover > img')?.absUrl('src') || manga.thumbnailUrl,
        author: authors.join(', ') || undefined,
        genres: names('漫画剧情,漫畫劇情'),
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      return chapterList((await load(manga.url)).document);
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.get(baseUrl() + chapter.url, { headers: headers() });
      const packed = /window\[".*?"\](\(.*\)\s*\{[\s\S]+\}\s*\(.*\))/.exec(response.body)?.[1];
      if (!packed) {
        if (response.body.includes('erroraudit_show') && !showR18()) throw new Error('R18作品显示开关未开启');
        throw new Error('Failed to find image code');
      }
      // The word list is LZString-compressed: '…'['\x73\x70…']('\x7c') → '…'.split('|')
      const code = packed.replace(
        /['"]([0-9A-Za-z+/=]+)['"]\[['"].*?['"]\]\(['"].*?['"]\)/g,
        (_, lz: string) => `'${decompressFromBase64(lz)}'.split('|')`,
      );
      const json = /\{.*\}/.exec(unpack(code.replace(/\\'/g, '-')))?.[0];
      if (!json) throw new Error('Failed to extract JSON from parsed code');
      const comic = JSON.parse(json) as Comic;
      return (comic.files ?? []).map((file, index) => ({
        index,
        imageUrl: `${IMAGE_SERVER}${comic.path ?? ''}${file}?e=${comic.sl?.e ?? 0}&m=${comic.sl?.m ?? ''}`,
      }));
    },
    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${baseUrl()}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/[^/?#]*(?:manhuagui|mhgui)\.com\/comic\/(\d+)/i.exec(url.trim());
      return match ? { url: `/comic/${match[1]}/`, title: '' } : null;
    },
    getWebUrl: (item) => baseUrl().replace('www.', 'm.').replace('tw.', 'm.') + item.url,
  }),
});
