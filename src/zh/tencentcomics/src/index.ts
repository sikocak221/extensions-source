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
import { absoluteUrl } from './common/utils';
import { evaluateNonce } from './expr';

// Listings and details come from the desktop site (more info, no chapters blocked); search from the mobile one.
const BASE_URL = 'https://m.ac.qq.com';
const DESKTOP_URL = 'https://ac.qq.com';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const headers = { 'User-Agent': DESKTOP_UA, Referer: `${DESKTOP_URL}/` };

async function load(url: string, userAgent = DESKTOP_UA): Promise<HtmlElement> {
  const response = await http.get(url, { headers: { ...headers, 'User-Agent': userAgent } });
  return html.load(response.body, { baseUrl: response.url });
}

/** Desktop listing (12 per page, no next button; a full page means there may be more). */
async function listing(path: string): Promise<MangaPage> {
  const document = await load(`${DESKTOP_URL}/Comic/all/${path}`);
  const items = document.select('ul.ret-search-list.clearfix > li').flatMap((li): MangaSummary[] => {
    const a = li.selectFirst('div > a');
    const id = (a?.attr('href') ?? '').split('/Comic/comicInfo/')[1];
    if (!a || !id) return [];
    return [
      {
        url: `/comic/index/${id}`,
        title: (a.attr('title') ?? '').trim(),
        thumbnailUrl: a.selectFirst('img')?.attr('data-original') || undefined,
      },
    ];
  });
  return { items, hasNextPage: items.length === 12 };
}

const option = (filters: FilterState, id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');

/** Strips the noise the nonce lists (`<offset><letters>` pairs, applied back to front) from DATA. */
function decodeData(raw: string, nonce: string): string {
  const chars = raw.split('');
  const pairs = nonce.match(/\d+[a-zA-Z]+/g) ?? [];
  for (let i = pairs.length - 1; i >= 0; i--) {
    const offset = parseInt(pairs[i]!, 10) & 255;
    chars.splice(offset, pairs[i]!.replace(/\d+/g, '').length);
  }
  return chars.join('');
}

interface ChapterData {
  chapter: { canRead: boolean };
  picture: { url: string }[];
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => listing(`search/hot/page/${page}`),
    getLatest: (page) => listing(`search/time/page/${page}`),
    getFilters: (): Filter[] => [
      { type: 'header', label: '注意：不影響按標題搜索' },
      {
        type: 'select',
        id: 'popularity',
        label: '热门人气/更新时间',
        default: 'hot/',
        options: [
          { label: '热门人气', value: 'hot/' },
          { label: '更新时间', value: 'time/' },
        ],
      },
      {
        type: 'select',
        id: 'vip',
        label: '属性',
        options: [
          { label: '全部', value: '' },
          { label: '付费', value: 'vip/2/' },
          { label: '免费', value: 'vip/1/' },
        ],
      },
      {
        type: 'select',
        id: 'status',
        label: '进度',
        options: [
          { label: '全部', value: '' },
          { label: '连载中', value: 'finish/1/' },
          { label: '已完结', value: 'finish/2/' },
        ],
      },
      {
        type: 'select',
        id: 'genre',
        label: '标签',
        options: [
          ['全部', ''],
          ['恋爱', '105'],
          ['玄幻', '101'],
          ['异能', '103'],
          ['恐怖', '110'],
          ['剧情', '106'],
          ['科幻', '108'],
          ['悬疑', '112'],
          ['奇幻', '102'],
          ['冒险', '104'],
          ['犯罪', '111'],
          ['动作', '109'],
          ['日常', '113'],
          ['竞技', '114'],
          ['武侠', '115'],
          ['历史', '116'],
          ['战争', '117'],
        ].map(([label, value]) => ({ label: label!, value: value! })),
      },
    ],
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (!query) {
        const genre = option(filters, 'genre');
        return listing(
          `${genre ? `theme/${genre}/` : ''}${option(filters, 'status')}search/${option(filters, 'popularity') || 'hot/'}${option(filters, 'vip')}page/${page}`,
        );
      }
      // The mobile search redirects to the JS-only desktop search when a desktop UA is sent.
      const document = await load(
        `${BASE_URL}/search/result?word=${encodeURIComponent(query)}&page=${page}`,
        MOBILE_UA,
      );
      const items = document.select('ul > li.comic-item > a').map((a): MangaSummary => ({
        url: (a.attr('href') ?? '').replace(/^https?:\/\/[^/]+/, ''),
        title: a.selectFirst('div > strong')?.text() ?? '',
        thumbnailUrl: a.selectFirst('div > img')?.attr('src') || undefined,
      }));
      return { items, hasNextPage: items.length === 10 };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(`${DESKTOP_URL}/Comic/comicInfo/${manga.url.split('/index/')[1]}`);
      const statusText = document.selectFirst('label.works-intro-status')?.text().trim();
      const status: MangaStatus = ['连载中', '連載中'].includes(statusText ?? '')
        ? 'ongoing'
        : ['已完结', '已完結'].includes(statusText ?? '')
          ? 'completed'
          : 'unknown';
      return {
        url: manga.url,
        title: document.selectFirst('.works-intro-title > strong')?.text() || manga.title,
        description: document.selectFirst('p.works-intro-short')?.text() || undefined,
        author: document.selectFirst('p.works-intro-digi > span > em')?.text() || undefined,
        status,
        thumbnailUrl: document.selectFirst('div.works-cover.ui-left > a > img')?.attr('src') || manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(`${DESKTOP_URL}/Comic/comicInfo/${manga.url.split('/index/')[1]}`);
      return document
        .select('.chapter-page-all .works-chapter-item')
        .map((item): Chapter => ({
          url: (item.selectFirst('a')?.attr('href') ?? '').replace(/^https?:\/\/[^/]+/, ''),
          name: (item.selectFirst('.ui-icon-pay') ? '🔒 ' : '') + item.text().trim(),
        }))
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const body = (await http.get(DESKTOP_URL + chapter.url, { headers })).body;
      // window["non"+"ce"] = "…" + (+eval("…")).toString() + …;
      const nonceSource = body.slice(body.lastIndexOf('window[')).split('] = ')[1]?.split('</script>')[0] ?? '';
      const raw = (body.slice(body.lastIndexOf('var DATA =') + 10).split('PRELOAD_NUM')[0] ?? '')
        .trim()
        .replace(/^'|',$/g, '');
      const data = JSON.parse(base64.decode(decodeData(raw, evaluateNonce(nonceSource)))) as ChapterData;
      if (!data.chapter.canRead) throw new Error('[此章节为付费内容]');
      return data.picture.map((picture, index) => ({ index, imageUrl: picture.url }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:m\.)?ac\.qq\.com\/(?:comic\/index|Comic\/comicInfo)\/id\/(\d+)/i.exec(url.trim());
      return match ? { url: `/comic/index/id/${match[1]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
