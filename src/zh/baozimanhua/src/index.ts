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
import { USER_AGENT, parseDate } from './common/utils';

// Web mirrors only (the app mirrors and www/cn/tw.baozimh.com answer 403 outside a browser).
const MIRRORS = [
  'www.webmota.com',
  'cn.webmota.com',
  'tw.webmota.com',
  'www.kukuc.co',
  'cn.kukuc.co',
  'tw.kukuc.co',
  'www.twmanga.com',
  'cn.twmanga.com',
  'tw.twmanga.com',
  'www.dinnerku.com',
  'cn.dinnerku.com',
  'tw.dinnerku.com',
];
const KNOWN_HOSTS = [...MIRRORS, 'www.baozimh.com', 'cn.baozimh.com', 'tw.baozimh.com'];
const MIRROR_PREF = 'mirror';
const IMAGE_HOST = 'https://static-tw.baozimh.com';
const DEDUPE_PREF = 'removeDuplicateImages';

const baseUrl = () => {
  const mirror = prefs.get<string>(MIRROR_PREF);
  return `https://${mirror && MIRRORS.includes(mirror) ? mirror : MIRRORS[0]}`;
};
const headers = () => ({ 'User-Agent': USER_AGENT, Referer: `${baseUrl()}/` });

async function load(url: string): Promise<{ document: HtmlElement; url: string }> {
  const response = await http.get(url.startsWith('http') ? url : baseUrl() + url, { headers: headers() });
  return { document: html.load(response.body, { baseUrl: response.url }), url: response.url };
}

const pathOf = (url: string) => url.replace(/^https?:\/\/[^/]+/, '');

function cards(document: HtmlElement): MangaSummary[] {
  let elements = document.select('div.comics-card');
  if (!elements.length) elements = document.select('div.pure-g div a.comics-card__poster');
  return elements.flatMap((element): MangaSummary[] => {
    const poster = element.selectFirst('.comics-card__poster') ?? element;
    const href = poster.attr('href') ?? '';
    const url = href ? pathOf(poster.absUrl('href') ?? href) : '';
    const title = (element.selectFirst('.comics-card__title')?.text() || poster.attr('title') || '').trim();
    if (!url || !title || title.includes('{{')) return [];
    const img = element.selectFirst('img, amp-img');
    return [{ url, title, thumbnailUrl: img?.absUrl('data-src') || img?.absUrl('src') || undefined }];
  });
}

const TAGS =
  '全部:all,都市:dushi,冒险:mouxian,热血:rexie,恋爱:lianai,耽美:danmei,武侠:wuxia,格斗:gedou,科幻:kehuan,魔幻:mohuan,' +
  '推理:tuili,玄幻:xuanhuan,日常:richang,生活:shenghuo,搞笑:gaoxiao,校园:xiaoyuan,奇幻:qihuan,萌系:mengxi,穿越:chuanyue,' +
  '后宫:hougong,战争:zhanzheng,历史:lishi,剧情:juqing,同人:tongren,竞技:jingji,励志:lizhi,治愈:zhiyu,机甲:jijia,纯爱:chunai,' +
  '美食:meishi,恶搞:egao,虐心:nuexin,动作:dongzuo,惊险:liangxian,唯美:weimei,复仇:fuchou,脑洞:naodong,宫斗:gongdou,' +
  '运动:yundong,灵异:lingyi,古风:gufeng,权谋:quanmou,节操:jiecao,明星:mingxing,暗黑:anhei,社会:shehui,音乐舞蹈:yinlewudao,' +
  '东方:dongfang,AA:aa,悬疑:xuanyi,轻小说:qingxiaoshuo,霸总:bazong,萝莉:luoli,战斗:zhandou,惊悚:liangsong,百合:yuri,' +
  '大女主:danuzhu,幻想:huanxiang,少女:shaonu,少年:shaonian,性转:xingzhuanhuan,重生:zhongsheng,韩漫:hanman,其它:qita';

const select = (id: string, label: string, options: string): Filter => {
  const pairs = options.split(',').map((pair) => pair.split(':') as [string, string]);
  return {
    type: 'select',
    id,
    label,
    default: pairs[0]![1],
    options: pairs.map(([l, value]) => ({ label: l, value })),
  };
};

const FILTERS: Filter[] = [
  { type: 'header', label: '注意：不影響按標題搜索' },
  select('type', '标签', TAGS),
  select('region', '地区', '全部:all,国漫:cn,日本:jp,韩国:kr,欧美:en'),
  select('state', '进度', '全部:all,连载中:serial,已完结:pub'),
  select('filter', '标题开头', '全部:*,ABCD:ABCD,EFGH:EFGH,IJKL:IJKL,MNOP:MNOP,QRST:QRST,UVW:UVW,XYZ:XYZ,0-9:0-9'),
];

async function classify(page: number, query = ''): Promise<MangaPage> {
  const items = cards((await load(`/classify?page=${page}${query}`)).document);
  return { items, hasNextPage: items.length >= 36 };
}

/** `/user/page_direct?comic_id=x&section_slot=s&chapter_slot=c` → `/comic/chapter/x/s_c.html` (skips a redirect). */
function chapterPath(href: string): string {
  const path = pathOf(href);
  if (!path.startsWith('/user/page_direct')) return path;
  const param = (name: string) => new RegExp(`[?&]${name}=([^&#]*)`).exec(path)?.[1] ?? '';
  return `/comic/chapter/${param('comic_id')}/${param('section_slot')}_${param('chapter_slot')}.html`;
}

function chapterList(document: HtmlElement): Chapter[] {
  // The full list (章节目录) sits in #chapter-items (+ #chapters_other_list, folded), newest last; without it the
  // page only shows the latest chapters, newest first.
  const full = document.select('#chapter-items .comics-chapters, #chapters_other_list .comics-chapters');
  const elements = full.length ? full.reverse() : document.select('.comics-chapters');
  const chapters = elements.flatMap((element): Chapter[] => {
    const href = element.selectFirst('a')?.attr('href')?.trim();
    return href ? [{ url: chapterPath(href.replace(/&amp;/g, '&')), name: element.text().trim() }] : [];
  });
  const date = document.selectFirst('em')?.text() ?? '';
  if (chapters.length && date.includes('年')) {
    chapters[0]!.uploadedAt = parseDate(date.replace(/^\(/, '').replace(/ 更新\)$/, ''), 'yyyy年MM月dd日');
  }
  return chapters;
}

const EXCLUDED = ['/cover/', 'logo', 'loading.gif', '404.png', 'favicon', '/img/', 'banner', 'recommend'];
const IMAGES =
  '.comic-contain amp-img, .comic-contain img, .comic-article img, .chapter-img amp-img, .chapter-img img, ' +
  '.comic-page amp-img, .comic-page img, [class*=chapter] amp-img, [class*=chapter] img, [class*=comic] amp-img, [class*=comic] img';

const imageId = (url: string) => Number(/\/(\d+)\.(?:jpg|jpeg|png|webp|gif)$/i.exec(url.split('?')[0]!)?.[1] ?? 0);

export default defineExtension({
  preferences: () => [
    {
      type: 'select',
      key: MIRROR_PREF,
      label: '镜像网址',
      options: MIRRORS.map((host) => ({ label: host, value: host })),
      default: MIRRORS[0]!,
    },
    {
      type: 'switch',
      key: DEDUPE_PREF,
      label: '移除新頁面重複圖片',
      description: '包子漫畫分頁會顯示上一頁最後幾張圖片，開啓功能可以移除重複的圖片',
      default: false,
    },
  ],
  createSource: () => ({
    get baseUrl() {
      return baseUrl();
    },
    getPopular: (page) => classify(page),
    async getLatest(): Promise<MangaPage> {
      return { items: cards((await load('/list/new')).document), hasNextPage: false };
    },
    getFilters: () => FILTERS,
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (!query) {
        const parts = ['type', 'region', 'state', 'filter'].map((id) => {
          const value =
            typeof filters[id] === 'string' && filters[id] ? (filters[id] as string) : id === 'filter' ? '*' : 'all';
          return `&${id}=${encodeURIComponent(value)}`;
        });
        return classify(page, parts.join(''));
      }
      const host = new RegExp('^https://([^/]+)').exec(baseUrl())![1]!.replace('.dinnerku.com', '.baozimh.com');
      return {
        items: cards((await load(`https://${host}/search?q=${encodeURIComponent(query)}`)).document),
        hasNextPage: false,
      };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(manga.url);
      const statusText = document.selectFirst('div.tag-list > span.tag')?.text().trim();
      const status: MangaStatus = ['连载中', '連載中'].includes(statusText ?? '')
        ? 'ongoing'
        : ['已完结', '已完結'].includes(statusText ?? '')
          ? 'completed'
          : 'unknown';
      return {
        url: manga.url,
        title: document.selectFirst('h1.comics-detail__title')?.text().trim() || manga.title,
        thumbnailUrl:
          document.selectFirst('meta[name=og:image]')?.attr('content') ||
          document.selectFirst('div.pure-g div > amp-img, div.pure-g div > img')?.absUrl('src') ||
          manga.thumbnailUrl,
        author: document.selectFirst('h2.comics-detail__author')?.text() || undefined,
        description: document.selectFirst('p.comics-detail__desc')?.text() || undefined,
        genres: document
          .select('div.tag-list > span.tag')
          .slice(1)
          .map((tag) => tag.text().trim())
          .filter(Boolean),
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      return chapterList((await load(manga.url)).document);
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const dedupe = prefs.get<boolean>(DEDUPE_PREF) === true;
      const urls: string[] = [];
      let lastId: number | undefined;
      let next: string | undefined = chapter.url;
      for (let guard = 0; next && guard < 50; guard++) {
        const { document, url } = await load(next);
        let images = [
          ...new Set(
            document
              .select(IMAGES)
              .map((img) => img.absUrl('data-src') || img.absUrl('src') || '')
              .filter((src) => src && !EXCLUDED.some((part) => src.includes(part))),
          ),
        ];
        if (dedupe && lastId !== undefined) images = images.filter((src) => imageId(src) > lastId!);
        urls.push(...images);
        if (images.length) lastId = Math.max(...images.map(imageId));
        const button = document.selectFirst('#next-chapter, .next-page');
        const link = button ?? document.select('a').find((a) => /下一页|下一頁/.test(a.text()));
        const nextUrl = link?.absUrl('href');
        next = link && nextUrl && nextUrl !== url && /下一页|下一頁/.test(link.text()) ? nextUrl : undefined;
      }
      // The page links the bzcdn.net CDN, whose edges redirect to hosts that often refuse connections;
      // static-tw.baozimh.com serves the same paths.
      return urls.map((imageUrl, index) => ({
        index,
        imageUrl: imageUrl.replace(/^https?:\/\/[^/]+\.(?:bzcdn\.net|baozicdn\.com)\//, `${IMAGE_HOST}/`),
      }));
    },
    imageHeaders: () => headers(),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/comic\/(?:chapter\/)?([^/?#]+)/i.exec(url.trim());
      return match && KNOWN_HOSTS.includes(match[1]!.toLowerCase()) ? { url: `/comic/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => baseUrl() + item.url,
  }),
});
