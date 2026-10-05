import {
  type Chapter,
  type Filter,
  type HtmlElement,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://www.favcomic.com';
const IMAGE_KEY = 'NlgrYjYuRT5ic1hifSs9Tg==';

const USERNAME: Preference = { type: 'text', key: 'USERNAME', label: '账号 (喜漫注册邮箱)', default: '' };
const PASSWORD: Preference = { type: 'text', key: 'PASSWORD', label: '密码', default: '' };
const RANK_TYPE: Preference = {
  type: 'select',
  key: 'RANK_TYPE',
  label: '热门排行',
  options: [
    { label: '周排名', value: '1' },
    { label: '月排名', value: '2' },
    { label: '总排名', value: '3' },
  ],
  default: '1',
};
const MANGA_TYPE: Preference = {
  type: 'select',
  key: 'MANGA_TYPE',
  label: '漫画类型',
  description: '指定“热门”和“最近更新”显示的漫画类型（“热门”没有“性感图库”类型，选择该项会显示全部类型）',
  options: [
    { label: '少男漫画', value: 'boy-1' },
    { label: '少女漫画', value: 'girl-2' },
    { label: '性感图库', value: 'picture-3' },
    { label: '成人漫画', value: 'r18-4' },
  ],
  default: 'boy-1',
};

const TYPES: [string, string][] = [
  ['全部', 'search'],
  ['少男漫画', 'boy'],
  ['少女漫画', 'girl'],
  ['性感图库', 'picture'],
  ['成人漫画', 'r18'],
];
const ORIGINS: [string, string][] = [
  ['全部', '0'],
  ['日本', '2'],
  ['韩国', '3'],
  ['大陆及港台', '1'],
  ['其它', '4'],
];
const STATUSES: [string, string][] = [
  ['全部', '0'],
  ['连载', '1'],
  ['完结', '2'],
];
const FREES: [string, string][] = [
  ['全部', '0'],
  ['免费', '1'],
  ['付费', '2'],
];
const SORTS: [string, string][] = [
  ['人气推荐', '1'],
  ['更新时间', '2'],
];

// Tags of each manga type: [label, value].
const TAGS: Record<string, [string, string][]> = {
  boy: [
    ['全部', '0'],
    ['奇幻', '1'],
    ['冒险', '4'],
    ['异世界', '7'],
    ['爱情', '36'],
    ['鬼神', '5'],
    ['推理悬疑', '2'],
    ['热血', '3'],
    ['恐怖·惊悚', '11'],
    ['节操', '41'],
    ['校园', '34'],
    ['搞笑喜剧', '6'],
    ['科幻', '42'],
    ['后宫', '40'],
    ['格斗', '32'],
    ['运动竞技', '9'],
    ['穿越', '88'],
    ['动作', '80'],
    ['战争', '16'],
    ['音乐', '39'],
    ['轻小说', '112'],
    ['励志', '15'],
    ['武侠', '13'],
    ['短篇', '35'],
    ['修真', '89'],
    ['百合', '118'],
    ['剧情', '79'],
    ['美食家', '12'],
    ['历史', '10'],
    ['职场', '43'],
    ['性转换', '45'],
    ['伪娘', '83'],
    ['黑道', '8'],
    ['其他', '14'],
  ],
  girl: [
    ['全部', '0'],
    ['恋爱', '17'],
    ['TL', '33'],
    ['BL', '19'],
    ['欢乐向', '31'],
    ['校园', '18'],
    ['百合', '21'],
    ['后宫·宮廷', '28'],
    ['轻小说', '44'],
    ['剧情', '81'],
    ['美食', '38'],
    ['职场', '26'],
    ['治愈', '24'],
    ['舞蹈音乐', '20'],
    ['性转换', '25'],
    ['伪娘', '82'],
    ['萌系', '22'],
    ['重生', '37'],
    ['生活日常', '27'],
    ['宠物', '30'],
    ['ABO', '125'],
    ['霸道总裁', '29'],
    ['古风', '23'],
    ['短篇', '46'],
    ['其他', '75'],
    ['NTR', '129'],
    ['扶他', '131'],
    ['异世界', '122'],
    ['被NTR', '132'],
  ],
  picture: [
    ['全部', '0'],
    ['Cosplay', '76'],
    ['AI生成', '87'],
    ['CG画集', '85'],
    ['写真', '86'],
    ['OnlyFans', '77'],
  ],
  r18: [
    ['全部', '0'],
    ['剧情向', '48'],
    ['无修正', '47'],
    ['同人', '110'],
    ['巨乳', '49'],
    ['制服·JK', '68'],
    ['口交', '52'],
    ['近亲·乱伦', '62'],
    ['熟女', '50'],
    ['伪娘', '93'],
    ['NTR', '55'],
    ['贫乳', '94'],
    ['束缚·捆绑', '108'],
    ['眼镜', '56'],
    ['3P·群交', '63'],
    ['丝袜', '104'],
    ['人外', '111'],
    ['辣妹', '65'],
    ['情趣内衣', '64'],
    ['浪漫爱情', '78'],
    ['兽耳', '60'],
    ['调教', '58'],
    ['百合', '90'],
    ['乳交', '51'],
    ['触手', '91'],
    ['妖精·魅魔', '95'],
    ['重口', '106'],
    ['兔女郎', '109'],
    ['黑肉', '59'],
    ['强暴', '57'],
    ['扶他', '101'],
    ['人妻', '54'],
    ['足交', '70'],
    ['处女', '97'],
    ['痴女', '98'],
    ['痴汉·丑男', '107'],
    ['性玩具', '61'],
    ['颜射', '99'],
    ['泳装', '100'],
    ['出汗', '73'],
    ['多毛', '74'],
    ['舔阴', '102'],
    ['双马尾', '67'],
    ['自慰', '69'],
    ['肛交', '96'],
    ['中出', '53'],
    ['修女', '133'],
    ['furry', '130'],
    ['排尿', '72'],
    ['倒乳头', '128'],
    ['AI生成', '123'],
    ['男娘', '117'],
    ['受孕', '124'],
    ['可爱', '121'],
    ['护士', '105'],
    ['催眠', '126'],
    ['潮吹', '71'],
    ['肉感女', '120'],
    ['女仆', '127'],
    ['双穴', '115'],
    ['长筒袜', '66'],
    ['正太', '119'],
    ['3D', '114'],
    ['露出', '103'],
    ['阿黑颜', '113'],
    ['yaoi', '116'],
  ],
};

// The site's session cookies after the automatic login (kept in memory).
let sessionCookie = '';

const headers = (): Record<string, string> => ({
  'User-Agent': USER_AGENT,
  Referer: `${BASE_URL}/`,
  ...(sessionCookie ? { Cookie: sessionCookie } : {}),
});

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers: headers() });
  return html.load(response.body, { baseUrl: response.url });
}

/** The cover's `data-src` plus the "encrypted" flag the images are decrypted by (see transformImage). */
function imageSrc(img: HtmlElement | null | undefined): string | undefined {
  const src = img?.absUrl('data-src');
  if (!src) return undefined;
  return `${src}#${(img?.attr('class') ?? '').split(/\s+/).includes('encrypted-image')}`;
}

function mangasPageParse(document: HtmlElement): MangaPage {
  const items = document.select('.cover_box > a').map((a): MangaSummary => ({
    url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
    title: a.attr('title') ?? '',
    thumbnailUrl: imageSrc(a.selectFirst('.cover')),
  }));
  const last = document.selectFirst('.pagination_box > .content_box > div:nth-last-child(2) > a');
  return { items, hasNextPage: last != null && !(last.attr('class') ?? '').split(/\s+/).includes('active') };
}

async function login(): Promise<boolean> {
  const username = prefs.get<string>(USERNAME.key) ?? '';
  const password = prefs.get<string>(PASSWORD.key) ?? '';
  if (!username.trim() || !password.trim()) return false;
  const response = await http.post<{ result?: string; msg?: string }>(
    `${BASE_URL}/login`,
    { form: { loginName: username, password } },
    { headers: { ...headers(), Referer: `${BASE_URL}/login` }, responseType: 'json' },
  );
  if (response.body.result === 'success') {
    const setCookie = Object.entries(response.headers).find(([name]) => name.toLowerCase() === 'set-cookie')?.[1] ?? '';
    const cookies = setCookie
      .split(/,\s*(?=[^;,=\s]+=)/)
      .map((c) => c.split(';')[0]!.trim())
      .filter((c) => c.includes('='));
    if (cookies.length) sessionCookie = cookies.join('; ');
    return true;
  }
  if (response.body.msg?.trim()) throw new Error(`自动登录失败: ${response.body.msg}`);
  return false;
}

const mangaType = () => prefs.get<string>(MANGA_TYPE.key) ?? 'boy-1';

export default defineExtension({
  preferences: () => [USERNAME, PASSWORD, RANK_TYPE, MANGA_TYPE],
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const document = await load(
        `/rank?range=${prefs.get<string>(RANK_TYPE.key) ?? '1'}&comicType=${mangaType().split('-')[1]}&vip=0`,
      );
      const items = document.select('.rank_item > a').map((a): MangaSummary & { author: string } => {
        const authors =
          a
            .select('.author a')
            .map((e) => e.text())
            .join(', ') ||
          (a.selectFirst('.author')?.text() ?? '');
        return {
          url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
          title: a.selectFirst('.cover > img')?.attr('alt') ?? '',
          thumbnailUrl: imageSrc(a.selectFirst('.cover > img')),
          author: authors,
        };
      });
      return { items: items.map(({ author: _author, ...m }) => m), hasNextPage: false };
    },
    async getLatest(page): Promise<MangaPage> {
      return mangasPageParse(await load(`/${mangaType().split('-')[0]}?page=${page}`));
    },
    async search(query, page, filters): Promise<MangaPage> {
      const value = (id: string, fallback: string) =>
        typeof filters[id] === 'string' && filters[id] ? (filters[id] as string) : fallback;
      const type = value('type', 'search');
      const params: [string, string][] = [
        ['keyword', query],
        ['origin', value('origin', '0')],
        ['finished', value('finished', '0')],
        ['free', value('free', '0')],
        ['sort', value('sort', '1')],
        ['page', String(page)],
      ];
      const tag = value(`tag.${type}`, '0');
      if (TAGS[type] && tag !== '0') params.push(['tag', tag]);
      const qs = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
      return mangasPageParse(await load(`/${query.trim() ? 'search' : type}?${qs}`));
    },
    getFilters: (): Filter[] => {
      const select = (id: string, label: string, options: [string, string][]): Filter => ({
        type: 'select',
        id,
        label,
        options: options.map(([l, value]) => ({ label: l, value })),
        default: options[0]![1],
      });
      return [
        { type: 'header', label: '筛选条件（漫画类型选择“全部”时，其余条件无效）' },
        select('type', '类型', TYPES),
        select('origin', '地区', ORIGINS),
        select('finished', '状态', STATUSES),
        select('free', '门槛', FREES),
        select('sort', '排序', SORTS),
        { type: 'separator' },
        { type: 'header', label: '分组标签（只有上面选中的漫画“类型”会生效）' },
        ...Object.entries(TAGS).map(([type, tags]) =>
          select(`tag.${type}`, `标签：${TYPES.find(([, v]) => v === type)?.[0] ?? type}`, tags),
        ),
      ];
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const doc = await load(manga.url);
      const note = doc.selectFirst('.translation_agency_box')?.text();
      const baseIntro = (doc.selectFirst('.intro_box > .txt')?.text() ?? '').split('作品介绍：').pop() ?? '';
      const authorLinks = doc
        .selectFirst('.author')
        ?.select('a')
        .map((a) => a.text())
        .join(', ');
      const statusText = doc.select('.state_box > span')[1]?.text();
      const status: MangaStatus = statusText === '连载中' ? 'ongoing' : statusText === '完结' ? 'completed' : 'unknown';
      return {
        url: manga.url,
        title: doc.selectFirst('.comic_title')?.text() ?? manga.title,
        thumbnailUrl: imageSrc(doc.selectFirst('.comic_cover_box > .flex_box > img')) ?? manga.thumbnailUrl,
        author: authorLinks || doc.selectFirst('.author')?.text() || undefined,
        description: baseIntro + (note ? `\n\n*译者/机构：${note}*` : ''),
        status,
        genres: doc.select('.tag_box a').map((a) => a.text()),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const doc = await load(manga.url);
      return doc
        .select('.catalog_box a')
        .map((a): Chapter => {
          const price = Number.parseFloat(a.select('span').pop()?.text() ?? '');
          return {
            url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
            name: `${Number.isNaN(price) ? '' : '\uD83E\uDE99 '}${a.selectFirst('.title')?.text() ?? ''}`,
            scanlator: Number.isNaN(price) ? undefined : `￥${price}`,
          };
        })
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      let doc = await load(chapter.url);
      let code = doc.selectFirst('.comic_chapter_box')?.attr('code');
      if (code === '1' && (await login())) {
        doc = await load(chapter.url);
        code = doc.selectFirst('.comic_chapter_box')?.attr('code');
      }
      if (code === '1') throw new Error('此话需在扩展设置中配置账号密码自动登录才能看');
      if (code === '3') throw new Error('金币不足，请充值');
      if (code === '4') throw new Error('请在网站中付费解锁此话');
      if (code === '444') throw new Error('免费额度已用完，明天零点重置');
      return doc.select('#content > img').map((img, index) => ({ index, imageUrl: imageSrc(img) ?? '' }));
    },
    imageHeaders: () => headers(),
    // Encrypted images ("#true" in the url): the first 16 bytes are the iv of an AES-CBC encrypted file.
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      if (!(page.imageUrl ?? '').endsWith('#true')) return {};
      return {
        bytes: crypto.aesDecrypt(bytes.subarray(16), base64.decodeBytes(IMAGE_KEY), {
          mode: 'cbc',
          iv: bytes.subarray(0, 16),
        }),
      };
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)(\/[^?#]+)/i.exec(url.trim());
      if (
        !match ||
        (match[1]?.toLowerCase() !== hostOf(BASE_URL).replace(/^www\./, '') &&
          match[1]?.toLowerCase() !== hostOf(BASE_URL))
      )
        return null;
      return { url: match[2]!, title: '' };
    },
  }),
});
