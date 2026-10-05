import {
  type Chapter,
  type Filter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://www.bilimanga.net';
const baseHeaders = { 'User-Agent': USER_AGENT, 'Accept-Language': 'zh', Accept: '*/*', Referer: `${BASE_URL}/` };

const POPULAR: Preference = {
  type: 'select',
  key: 'POPULAR_MANGA_DISPLAY',
  label: '熱門漫畫顯示内容',
  options: [
    { label: '月點擊榜', value: '/top/monthvisit/%d.html' },
    { label: '周點擊榜', value: '/top/weekvisit/%d.html' },
    { label: '月推薦榜', value: '/top/monthvote/%d.html' },
    { label: '周推薦榜', value: '/top/weekvote/%d.html' },
    { label: '月鮮花榜', value: '/top/monthflower/%d.html' },
    { label: '周鮮花榜', value: '/top/weekflower/%d.html' },
    { label: '月雞蛋榜', value: '/top/monthegg/%d.html' },
    { label: '周雞蛋榜', value: '/top/weekegg/%d.html' },
    { label: '最新入庫', value: '/top/postdate/%d.html' },
    { label: '收藏榜', value: '/top/goodnum/%d.html' },
    { label: '新書榜', value: '/top/newhot/%d.html' },
  ],
  default: '/top/weekvisit/%d.html',
};
const DESCRIPTION: Preference = {
  type: 'multiselect',
  key: 'DESCRIPTION',
  label: '作品信息顯示偏好',
  description: '設定作品簡介中需要顯示的額外信息',
  options: [
    { label: '作品公告', value: 'A' },
    { label: '作品别名', value: 'B' },
    { label: '跳轉連結', value: 'C' },
  ],
  default: ['A', 'B', 'C'],
};

// [label, [label, value][]] per filter.
const FILTERS: Record<string, [string, [string, string][]]> = {
  theme: [
    '作品主題',
    [
      ['不限', '0'],
      ['奇幻', '1'],
      ['冒險', '2'],
      ['異世界', '3'],
      ['龍傲天', '4'],
      ['魔法', '5'],
      ['仙俠', '6'],
      ['戰爭', '7'],
      ['熱血', '8'],
      ['戰鬥', '9'],
      ['競技', '10'],
      ['懸疑', '11'],
      ['驚悚', '12'],
      ['獵奇', '13'],
      ['神鬼', '14'],
      ['偵探', '15'],
      ['校園', '16'],
      ['日常', '17'],
      ['JK', '18'],
      ['JC', '19'],
      ['青梅竹馬', '20'],
      ['妹妹', '21'],
      ['大小姐', '22'],
      ['女兒', '23'],
      ['愛情', '24'],
      ['耽美', '25'],
      ['百合', '26'],
      ['NTR', '27'],
      ['後宮', '28'],
      ['職場', '29'],
      ['經營', '30'],
      ['犯罪', '31'],
      ['旅行', '32'],
      ['群像', '33'],
      ['女性視角', '34'],
      ['歷史', '35'],
      ['武俠', '36'],
      ['東方', '37'],
      ['勵志', '38'],
      ['宅系', '39'],
      ['科幻', '40'],
      ['機戰', '41'],
      ['遊戲', '42'],
      ['異能', '43'],
      ['腦洞', '44'],
      ['病嬌', '45'],
      ['人外', '46'],
      ['復仇', '47'],
      ['鬥智', '48'],
      ['惡役', '49'],
      ['間諜', '50'],
      ['治癒', '51'],
      ['歡樂', '52'],
      ['萌系', '53'],
      ['末日', '54'],
      ['大逃殺', '55'],
      ['音樂', '56'],
      ['美食', '57'],
      ['性轉', '58'],
      ['偽娘', '59'],
      ['穿越', '60'],
      ['童話', '61'],
      ['轉生', '62'],
      ['黑暗', '63'],
      ['溫馨', '64'],
      ['超自然', '65'],
      ['青春', '66'],
    ],
  ],
  type: [
    '作品分類',
    [
      ['全部', '0'],
      ['奇幻冒險', '1'],
      ['戰鬥熱血', '2'],
      ['懸疑驚悚', '3'],
      ['校園青春', '4'],
      ['愛情浪漫', '5'],
      ['職場都市', '6'],
      ['歷史文化', '7'],
      ['科幻未來', '8'],
      ['奇異幻想', '9'],
      ['治癒溫馨', '10'],
      ['末日生存', '11'],
      ['其他分類', '12'],
    ],
  ],
  region: [
    '作品地區',
    [
      ['不限', '0'],
      ['日本', '1'],
      ['韓國', '2'],
      ['港台', '3'],
      ['歐美', '4'],
      ['大陸', '5'],
    ],
  ],
  sort: [
    '排序方式',
    [
      ['最近更新', 'lastupdate'],
      ['月點擊', 'monthvisit'],
      ['周點擊', 'weekvisit'],
      ['月推薦', 'monthvote'],
      ['周推薦', 'weekvote'],
      ['月鮮花', 'monthflower'],
      ['周鮮花', 'weekflower'],
      ['字數', 'words'],
      ['收藏數', 'goodnum'],
      ['最新入庫', 'postdate'],
    ],
  ],
  anime: [
    '是否動畫',
    [
      ['不限', '0'],
      ['已動畫化', '1'],
      ['未動畫化', '2'],
    ],
  ],
  novel: [
    '是否輕改',
    [
      ['不限', '0'],
      ['輕改漫畫', '1'],
      ['普通漫畫', '2'],
    ],
  ],
  status: [
    '連載狀態',
    [
      ['不限', '0'],
      ['連載', '1'],
      ['完結', '2'],
    ],
  ],
  time: [
    '更新時間',
    [
      ['不限', '0'],
      ['三日內', '1'],
      ['七日內', '2'],
      ['半月內', '3'],
      ['一月內', '4'],
    ],
  ],
  year: [
    '發表年代',
    [
      ['不限', '0'],
      ['2026年', '2026'],
      ['2025年', '2025'],
      ['2024年', '2024'],
      ['2023年', '2023'],
      ['2022年', '2022'],
      ['2021年', '2021'],
      ['2020年', '2020'],
      ['2019年', '2019'],
      ['2018年', '2018'],
      ['2017年', '2017'],
      ['2016年', '2016'],
      ['2015年', '2015'],
      ['2014年', '2014'],
      ['2013年', '2013'],
      ['2012年', '2012'],
      ['2011年', '2011'],
      ['2010年', '2010'],
      ['00年代', '2000'],
      ['90年代', '1990'],
      ['80年代', '1980'],
      ['更早', '1970'],
    ],
  ],
  award: [
    '這本漫畫真厲害',
    [
      ['不限', '0'],
      ['2027', '2027'],
      ['2026', '2026'],
      ['2025', '2025'],
      ['2024', '2024'],
      ['2023', '2023'],
      ['2022', '2022'],
      ['2021', '2021'],
      ['2020', '2020'],
      ['2019', '2019'],
      ['2018', '2018'],
      ['2017', '2017'],
      ['2016', '2016'],
      ['2015', '2015'],
      ['2014', '2014'],
      ['2013', '2013'],
      ['2012', '2012'],
      ['2011', '2011'],
      ['2010', '2010'],
      ['2009', '2009'],
      ['2008', '2008'],
      ['2007', '2007'],
      ['2006', '2006'],
    ],
  ],
};

// Filter order of the url: /filter/${Sort}_${Theme}_${Status}_${Anime}_${Region}_${Type}_${Time}_${Novel}_${page}_0_${Year}_${Award}.html
const FILTER_ORDER = ['theme', 'type', 'region', 'year', 'sort', 'anime', 'novel', 'award', 'status', 'time'];

/** The site's cookies (night mode, search tickets), kept in memory. */
const cookies = new Map<string, string>([['night', '1']]);

function absorbCookies(setCookie: string | undefined) {
  for (const cookie of (setCookie ?? '').split(/,\s*(?=[^;,=\s]+=)/)) {
    const [pair] = cookie.split(';');
    const index = pair?.indexOf('=') ?? -1;
    if (pair && index > 0) cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
}

async function request(url: string): Promise<{ body: string; url: string }> {
  const cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  const response = await http.get(url, { headers: { ...baseHeaders, Cookie: cookie } });
  absorbCookies(Object.entries(response.headers).find(([name]) => name.toLowerCase() === 'set-cookie')?.[1]);
  return { body: response.body, url: response.url };
}

async function load(path: string): Promise<{ document: HtmlElement; url: string; body: string }> {
  const { body, url } = await request(absoluteUrl(BASE_URL, path));
  return { document: html.load(body, { baseUrl: url }), url, body };
}

const toHalfWidthDigits = (text: string) =>
  [...text].map((c) => (c >= '０' && c <= '９' ? String.fromCharCode(c.charCodeAt(0) - 65248) : c)).join('');

const wholeText = (element: HtmlElement | null | undefined, separator: string) =>
  (element?.html() ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/(?:\n\r?\n)+/g, separator)
    .trim();

async function ensureSearchTicket(): Promise<void> {
  if (!cookies.has('jieqiSearchCss') || !cookies.has('jieqiSearchJs')) {
    await request(`${BASE_URL}/search.html?search_guard=css`);
    const { body } = await request(`${BASE_URL}/search.html?search_guard=js`);
    const cookie = /cookie="(.*?)";/.exec(body)?.[1];
    if (cookie) absorbCookies(cookie);
  }
  await request(`${BASE_URL}/search.html?search_guard=redeem`);
  if (!cookies.get('jieqiSearchTicket')) throw new Error('獲取搜索憑證失敗，請稍後重試');
}

function mangaPageParse(document: HtmlElement, url: string): MangaPage {
  const items = document.select('.book-layout').flatMap((element): MangaSummary[] => {
    const img = element.selectFirst('img');
    const href = element.absUrl('href') || element.attr('href');
    if (!href) return [];
    return [
      { url: relativeUrl(href), title: img?.attr('alt') ?? '', thumbnailUrl: img?.absUrl('data-src') || undefined },
    ];
  });
  let hasNextPage: boolean;
  if (url.includes('filter')) {
    const total = Number.parseInt(document.selectFirst('#pagelink > .last')?.text() ?? '', 10);
    const current = Number.parseInt(document.selectFirst('#pagelink > strong')?.text() ?? '', 10);
    hasNextPage = !Number.isNaN(total) && !Number.isNaN(current) && current < total;
  } else if (url.includes('search')) {
    const match = /第(\d+)\/(\d+)页/.exec(document.selectFirst('#pagelink > span')?.text() ?? '');
    hasNextPage = match != null && Number(match[1]) < Number(match[2]);
  } else hasNextPage = items.length === 50;
  return { items, hasNextPage };
}

function parseManga(document: HtmlElement, url: string): MangaDetails {
  const warning = document.selectFirst('.aui-ver-form');
  if (warning) throw new Error(warning.text());
  const meta = document.select('.book-meta em').map((e) => e.text());
  const main = meta.filter((t) => /收藏|推薦|連載中|已完結/.test(t));
  const extra = meta.filter((t) => !/收藏|推薦|連載中|已完結/.test(t));
  const configs = prefs.get<string[]>(DESCRIPTION.key) ?? ['A', 'B', 'C'];
  let description = wholeText(document.selectFirst('#bookSummary > content'), '\n\n\n');
  for (const item of configs) {
    if (item === 'A') {
      const notice = document.selectFirst('.notice');
      description = `${notice ? `> ${wholeText(notice, '\n')}\n\n` : ''}${description}`;
    } else if (item === 'B') {
      const alias = document.selectFirst('.backupname');
      description += alias ? `\n\n\n***别名**：${alias.text()}* ` : '';
    } else if (item === 'C') {
      const novel = document
        .select('.book-detail-btn .btn-group-cell > a')
        .find((a) => a.text() === '輕小說')
        ?.attr('href')
        ?.split('?')[1];
      description += novel
        ? `\n\n\n***[跳轉至「哔哩轻小说」上的同名小說](https://www.bilinovel.com/novel/${novel}.html)*** `
        : '';
    }
  }
  const artist = document.selectFirst('.authorname')?.text();
  const statusText = main[main.length - 1];
  const status: MangaStatus = statusText === '連載中' ? 'ongoing' : statusText === '已完結' ? 'completed' : 'unknown';
  return {
    url: relativeUrl(url),
    title: document.selectFirst('.book-title')?.text() ?? '',
    thumbnailUrl: document.selectFirst('.book-cover')?.attr('src') || undefined,
    description,
    artist,
    author: document.selectFirst('.illname')?.text() ?? artist,
    status,
    genres: [...document.select('.tag-small').map((e) => e.text()), ...extra],
  };
}

const mangaId = (url: string) => /\/detail\/(\d+)\.html/.exec(url)?.[1] ?? '';

export default defineExtension({
  preferences: () => [POPULAR, DESCRIPTION],
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(page): Promise<MangaPage> {
      const pattern = prefs.get<string>(POPULAR.key) ?? '/top/weekvisit/%d.html';
      const { document, url } = await load(pattern.replace('%d', String(page)));
      return mangaPageParse(document, url);
    },
    async getLatest(page): Promise<MangaPage> {
      const { document, url } = await load(`/top/lastupdate/${page}.html`);
      return mangaPageParse(document, url);
    },
    async search(query, page, filters): Promise<MangaPage> {
      let path: string;
      if (query.trim()) {
        await ensureSearchTicket();
        path = `/search/${encodeURIComponent(query)}_${page}.html`;
      } else {
        const value = (name: string) => {
          const options = FILTERS[name]![1];
          const picked = filters[name];
          return typeof picked === 'string' && picked ? picked : options[0]![1];
        };
        const [theme, type, region, year, sort, anime, novel, award, status, time] = FILTER_ORDER.map(value);
        path = `/filter/${sort}_${theme}_${status}_${anime}_${region}_${type}_${time}_${novel}_${page}_0_${year}_${award}.html`;
      }
      const { document, url } = await load(path);
      if (url.includes('/detail/')) return { items: [{ ...parseManga(document, url) }], hasNextPage: false };
      return mangaPageParse(document, url);
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: '篩選條件（搜尋關鍵字時無效）' },
      ...Object.entries(FILTERS).map(([id, [label, options]]): Filter => ({
        type: 'select',
        id,
        label,
        options: options.map(([l, value]) => ({ label: l, value })),
        default: options[0]![1],
      })),
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document, url } = await load(manga.url);
      return parseManga(document, url);
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { document } = await load(`/read/${mangaId(manga.url)}/catalog`);
      const info = document.selectFirst('.chapter-sub-title')?.text() ?? '';
      const title = document.selectFirst('.book-title')?.text() ?? '';
      const date = parseDate(/\d{4}-\d{1,2}-\d{1,2}/.exec(info)?.[0], 'yyyy-M-d');
      const toChapters = (elements: HtmlElement[], volume?: string): Chapter[] =>
        elements.map((element, i) => {
          const href = element.absUrl('href') || element.attr('href') || '';
          // The first chapter of a book has no link ("javascript:cid(1)"): the neighbours' pages know where it is.
          const url =
            href && href !== 'javascript:cid(1)'
              ? relativeUrl(href)
              : i === 0
                ? `${relativeUrl(elements[1]?.absUrl('href') ?? '')}#prev`
                : `${relativeUrl(elements[i - 1]?.absUrl('href') ?? '')}#next`;
          return { url, name: toHalfWidthDigits(element.text()), uploadedAt: date, scanlator: volume };
        });
      const volumes = document.select('.catalog-volume');
      if (volumes.length > 0) {
        return volumes
          .flatMap((volume) => {
            const bar = (volume.selectFirst('.chapter-bar')?.text() ?? '').slice(title.length + 1);
            const label = /^\d/.test(bar) ? `Vol.${bar}` : toHalfWidthDigits(bar);
            return toChapters(volume.select('.chapter-li-a'), label);
          })
          .reverse();
      }
      return toChapters(document.select('.chapter-li-a')).reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      let [path, direction] = chapter.url.split('#') as [string, string | undefined];
      if (direction === 'prev' || direction === 'next') {
        // Read the neighbour page's script for the url of the chapter ("url_previous:'…'" / "url_next:'…'").
        const { body } = await request(absoluteUrl(BASE_URL, path));
        const regex = direction === 'prev' ? /url_previous:'(.*?)'/ : /url_next:'(.*?)'/;
        const found = regex.exec(body)?.[1];
        const ids = /\/read\/(\d+)\/(\d+)\.html/.exec(path);
        const guess = ids
          ? `/read/${ids[1]}/${Number(ids[2]) + (direction === 'prev' ? -1 : 1)}.html`
          : '/read/0/0.html';
        path = (found ?? guess).replace('.', '_2.');
      }
      const { document } = await load(path);
      const images = document.select('.imagecontent');
      if (images.length === 0) {
        const note = document.selectFirst('#acontentz')?.text();
        throw new Error(
          note
            ? note.includes('電腦端')
              ? '不支持電腦端查看，請更換移動端UA標識'
              : '漫畫可能已下架或需要足夠的權限'
            : '章节鏈接错误',
        );
      }
      return images.map((img, index) => ({ index, imageUrl: img.attr('data-src') ?? '' }));
    },
    imageHeaders: () => baseHeaders,
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url.split('#')[0]!),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)(\/detail\/\d+\.html)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase().replace(/^www\./, '') !== hostOf(BASE_URL).replace(/^www\./, ''))
        return null;
      return { url: match[2]!, title: '' };
    },
  }),
});
