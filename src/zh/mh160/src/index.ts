import {
  type Chapter,
  type Filter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://www.mh160mh.com';
const MOBILE_URL = BASE_URL.replace('www.', 'm.');
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

// Browse categories of the mobile site: [label, path slug under /kanmanhua/]. The site only supports browsing one
// category at a time, so they are flattened into one selector.
const CATEGORIES: [string, string][] = [
  ['全部分类', ''],
  ['连载中', 'lianzai'],
  ['完结', 'wanjie'],
  ['日韩', 'zaixian_rhmh'],
  ['内地', 'zaixian_dlmh'],
  ['港台', 'zaixian_gtmh'],
  ['欧美', 'zaixian_ommh'],
  ['其他', 'zaixian_qita'],
  ['少年', 'shaonianqu'],
  ['少女', 'shaonvqu'],
  ['青年', 'qingnian'],
  ['少儿', 'shaoer'],
  ['热血', 'rexue'],
  ['格斗', 'gedou'],
  ['科幻', 'kehuan'],
  ['竞技', 'jingji'],
  ['搞笑', 'gaoxiao'],
  ['推理', 'tuili'],
  ['恐怖', 'kongbu'],
  ['耽美', 'danmei'],
  ['恋爱', 'lianai'],
  ['生活', 'shenghuo'],
  ['战争', 'zhanzheng'],
  ['故事', 'gushi'],
  ['冒险', 'maoxian'],
  ['魔幻', 'mohuan'],
  ['玄幻', 'xuanhuan'],
  ['校园', 'xiaoyuan'],
  ['悬疑', 'xuanyi'],
  ['萌系', 'mengxi'],
  ['穿越', 'chuanyue'],
  ['后宫', 'hougong'],
  ['都市', 'dushi'],
  ['武侠', 'wuxia'],
  ['历史', 'lishi'],
  ['同人', 'tongren'],
  ['励志', 'lizhi'],
  ['百合', 'baihe'],
  ['治愈', 'zhiyu'],
  ['机甲', 'jijia'],
  ['纯爱', 'chunai'],
  ['美食', 'meishi'],
  ['血腥', 'xuexing'],
  ['僵尸', 'jiangshi'],
  ['恶搞', 'egao'],
  ['虐心', 'nuexin'],
  ['动作', 'dongzuo'],
  ['惊险', 'jingxian'],
  ['唯美', 'weimei'],
  ['震撼', 'zhenhan'],
  ['复仇', 'fuchou'],
  ['侦探', 'zhentan'],
  ['脑洞', 'naodong'],
  ['奇幻', 'qihuan'],
  ['宫斗', 'gongdou'],
  ['爆笑', 'baoxiao'],
  ['运动', 'yundong'],
  ['青春', 'qingchun'],
  ['灵异', 'lingyi'],
  ['古风', 'gufeng'],
  ['权谋', 'quanmou'],
  ['节操', 'jiecao'],
  ['明星', 'mingxing'],
  ['暗黑', 'anhei'],
  ['社会', 'shehui'],
  ['浪漫', 'langman'],
  ['仙侠', 'xianxia'],
  ['伪娘', 'weiniang'],
];

// qingtiancms (qTcms): each chapter page embeds a base64 string of image paths separated by `$qingtiandy$`, and the
// reader script picks an image host from the chapter id.
const PATH_SEPARATOR = '$qingtiandy$';
const LEGACY_IMAGE_HOST = 'https://mhpic6.tgmhfc.uk';
const IMAGE_HOSTS = [
  'https://mhpic5er.tgmhfc.uk',
  'https://mhpic789-5.tgmhfc.uk',
  'https://mhpic7fr.tgmhfc.uk',
  'https://mhpicwt.tgmhfc.uk',
  'https://mhpicwx.tgmhfc.uk',
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function mangaFromItemBox(element: HtmlElement): MangaSummary[] {
  const link = element.selectFirst('.itemTxt a.title');
  if (!link) return [];
  return [
    {
      url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
      title: link.text(),
      thumbnailUrl: element.selectFirst('.itemImg img')?.absUrl('src') || undefined,
    },
  ];
}

async function parseMobileList(url: string): Promise<MangaPage> {
  const document = await load(url);
  return { items: document.select('.itemBox').flatMap(mangaFromItemBox), hasNextPage: false };
}

// Keyword search results use the site's standard search list.
function parseSearchList(document: HtmlElement): MangaPage {
  const items = document.select('ul.mh-search-list > li').flatMap((element): MangaSummary[] => {
    const link = element.selectFirst('.mh-works-title h4 a');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: link.text(),
        thumbnailUrl: element.selectFirst('.mh-nlook-w img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: false };
}

// Category pages render the first page of results into #listbody.
function parseCategoryPage(document: HtmlElement): MangaPage {
  const items = document.select('#listbody li').flatMap((element): MangaSummary[] => {
    const link = element.selectFirst('a.ImgA');
    if (!link) return [];
    const href = link.absUrl('href') || link.attr('href') || '';
    return [
      {
        url: relativeUrl(href),
        title: element.selectFirst('a.txtA')?.text() ?? href.replace(/\/+$/, '').split('/').pop() ?? '',
        thumbnailUrl: link.selectFirst('img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: false };
}

function encodePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: () => parseMobileList(`${MOBILE_URL}/kanmanhua/zaixian_hit.html`),
    getLatest: () => parseMobileList(`${MOBILE_URL}/kanmanhua/zaixian_recent.html`),
    async search(query, page, filters): Promise<MangaPage> {
      if (query.trim()) {
        try {
          return parseSearchList(
            await load(`${BASE_URL}/statics/searchelxt1e1.aspx?key=${encodeURIComponent(query.trim())}&page=${page}`),
          );
        } catch (error) {
          // The search page is sometimes behind a Cloudflare challenge: filter the hot and recent lists instead.
          log.warn('Search failed, filtering the hot and recent lists', error);
          const needle = query.trim().toLowerCase();
          const lists = await Promise.all([
            parseMobileList(`${MOBILE_URL}/kanmanhua/zaixian_hit.html`),
            parseMobileList(`${MOBILE_URL}/kanmanhua/zaixian_recent.html`),
          ]);
          const seen = new Set<string>();
          const items = lists
            .flatMap((list) => list.items)
            .filter((m) => m.title.toLowerCase().includes(needle) && !seen.has(m.url) && seen.add(m.url));
          return { items, hasNextPage: false };
        }
      }
      // Browse the selected category, or fall back to the hot ranking.
      const slug = typeof filters.category === 'string' && filters.category ? filters.category : 'zaixian_hit.html';
      return parseCategoryPage(await load(`${MOBILE_URL}/kanmanhua/${slug}`));
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'category',
        label: '分类',
        options: CATEGORIES.map(([label, value]) => ({ label, value })),
        default: '',
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      const author =
        document.selectFirst('.works-info-tc .one em')?.text() ||
        document
          .select('.sub_r .txtItme')
          .find((e) => e.text().includes('作者'))
          ?.text()
          .split('作者：')[1]
          ?.trim();
      const statusText = document
        .select('p.works-info-tc span')
        .find((e) => e.text().includes('状态'))
        ?.selectFirst('em')
        ?.text();
      const status: MangaStatus =
        statusText === '连载中'
          ? 'ongoing'
          : statusText === '已完结' || statusText === '完结'
            ? 'completed'
            : 'unknown';
      return {
        url: manga.url,
        title:
          document.selectFirst('.mh-date-info-name h4 a')?.text() ||
          document.selectFirst('.txtItme.h1')?.text() ||
          document.selectFirst('title')?.text().split('漫画,')[0] ||
          manga.title,
        thumbnailUrl:
          document.selectFirst('.mh-date-bgpic img')?.absUrl('src') ||
          document.selectFirst('#Cover img')?.absUrl('src') ||
          manga.thumbnailUrl,
        author: author || undefined,
        artist: author || undefined,
        description:
          document.selectFirst('#workint')?.text() || document.selectFirst('.detailContent p')?.text() || undefined,
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      return document.select('ul[id^=mh-chapter-list-ol] li a, ul[id^=chapterList_ul] li a').map((link) => ({
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        name: link.selectFirst('p')?.text() || link.text(),
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.get(absoluteUrl(BASE_URL, chapter.url), { headers });
      const body = response.body;
      const encoded = /qTcms_S_m_murl_e\s*=\s*"([^"]+)"/.exec(body)?.[1];
      if (!encoded) throw new Error('找不到图片列表，页面结构可能已更改');
      const decoded = base64.decode(encoded);
      if (decoded.includes('+http://') || decoded.includes('+https://')) throw new Error('该章节已下架');
      const chapterId = Number.parseInt(/qTcms_S_p_id\s*=\s*"(\d+)"/.exec(body)?.[1] ?? '0', 10);
      // Mirrors f_qTcms_Pic_curUrl_realpic() in the site's show.js.
      const host = chapterId > 542724 ? IMAGE_HOSTS[chapterId % IMAGE_HOSTS.length]! : LEGACY_IMAGE_HOST;
      return decoded
        .split(PATH_SEPARATOR)
        .filter((path) => path.trim())
        .map((path, index) => ({
          index,
          imageUrl: path.startsWith('http')
            ? path
            : path.startsWith('/')
              ? host + encodePath(path)
              : `${BASE_URL}/statics/pic/?p=${encodeURIComponent(path)}`,
        }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)\/kanmanhua\/([A-Za-z0-9]+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase().replace(/^(www|m)\./, '') !== hostOf(BASE_URL).replace(/^www\./, ''))
        return null;
      return { url: `/kanmanhua/${match[2]}/`, title: '' };
    },
  }),
});
