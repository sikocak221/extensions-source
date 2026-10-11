import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { absoluteUrl, ownText } from './common/utils';
import { speedBinbPagesFromDocument, speedBinbTransform } from './speedbinb';

const BASE_URL = 'https://www.cmoa.jp';
const HIDE_LOCKED = 'hide_locked';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';
const headers = { 'User-Agent': UA, Cookie: 'safesearch=0; R18user=1', Referer: `${BASE_URL}/` };

type Opt = [string, string];
const GENRES: Opt[] = [
  ['すべてのジャンル', ''],
  ['少女マンガ', '20'],
  ['女性マンガ', '2'],
  ['少年マンガ', '12'],
  ['青年マンガ', '13'],
  ['BLマンガ', '24'],
  ['TLマンガ', '34'],
  ['ハーレクインコミックス', '21'],
  ['アダルトマンガ', '11'],
  ['マンガ雑誌', '28'],
  ['雑誌', '9925'],
  ['写真集', '9923'],
];
const PRICES: Opt[] = [
  ['すべての価格', ''],
  ['～100pt', '0-100'],
  ['101pt～500pt', '101-500'],
  ['501pt～1,000pt', '501-1000'],
  ['1,001pt～', '1001-'],
];
const REVIEWS: Opt[] = [
  ['すべての評価', ''],
  ['4.0以上', 'review_4'],
  ['3.0以上', 'review_3'],
  ['2.0以上', 'review_2'],
  ['1.0以上', 'review_1'],
  ['レビュー無し', 'review_nothing'],
];
const SORTS: Opt[] = [
  ['オススメ順', '10'],
  ['人気順', '14'],
  ['新着順', '16'],
  ['価格の安い順', '11'],
  ['価格の高い順', '12'],
  ['レビューの評価順', '13'],
  ['レビュー数の多い順', '15'],
];
const TEXTS: Opt[] = [
  ['title_nm', 'タイトル名'],
  ['author_nm', '作家名'],
  ['magazine_nm', '雑誌・レーベル'],
  ['publisher_nm', '出版社'],
  ['titletag_nm', '作品タグ'],
];
const SELECTS: [string, string, Opt[]][] = [
  ['genre_id', 'ジャンル', GENRES],
  ['point', '価格', PRICES],
  ['review', 'レビュー評点', REVIEWS],
  ['sort', '並び替え', SORTS],
];
const CHECKS: Opt[] = [
  ['free_cam_flg', '無料版あり'],
  ['sample_up_flg', '立読み増量'],
  ['campaign_flg', '値引き/還元'],
  ['newest_flg', '新着/新刊'],
  ['complete_flg', '完結作品'],
];

type Doc = ReturnType<typeof html.load>;
async function load(url: string) {
  const res = await http.get(url, { headers });
  return { doc: html.load(res.body, { baseUrl: res.url }), url: res.url };
}
const idOf = (href: string) => /\/title\/(\d+)/.exec(href)?.[1] ?? '';

function parseSearch(doc: Doc): MangaPage {
  const items: MangaSummary[] = [];
  for (const el of doc.select('li.search_result_box')) {
    const title = el.selectFirst('div.search_result_box_right_sec1 a.title')?.text().trim();
    const link = el.selectFirst('div.search_result_box_left a.title')?.absUrl('href');
    const img = el.selectFirst('div.search_result_box_left img');
    if (!title || !link) continue;
    items.push({ url: `/title/${idOf(link)}`, title, thumbnailUrl: img?.absUrl('data-src') || img?.absUrl('src') });
  }
  return { items, hasNextPage: doc.selectFirst('li.next:not(.nopage)') != null };
}

export default defineExtension({
  preferences: () => [{ type: 'switch', key: HIDE_LOCKED, label: 'Hide Locked Chapters', default: false }],
  createSource: () => ({
    baseUrl: BASE_URL,
    imageHeaders: () => ({ 'User-Agent': UA, Referer: `${BASE_URL}/` }),
    async getPopular() {
      return parseSearch((await load(`${BASE_URL}/search/purpose/ranking/all?period=daily&daily=all`)).doc);
    },
    async getLatest(page): Promise<MangaPage> {
      const { doc } = await load(`${BASE_URL}/newrelease/?page=${page}`);
      const items: MangaSummary[] = [];
      for (const el of doc.select('ul.title_list li.title_wrap')) {
        const title = el.selectFirst('div.text_box p.title_name')?.text().trim();
        const link = el.selectFirst('div.thum_box a')?.absUrl('href');
        if (!title || !link) continue;
        items.push({
          url: `/title/${idOf(link)}`,
          title,
          thumbnailUrl: el.selectFirst('div.thum_box a img')?.absUrl('src'),
        });
      }
      return {
        items,
        hasNextPage: doc.selectFirst('div.pageSlider div.swiper-slide.selected + div.swiper-slide') != null,
      };
    },
    getFilters(): Filter[] {
      return [
        { type: 'header', label: 'Note: Novels are not supported!' },
        ...TEXTS.map(([id, label]): Filter => ({ type: 'text', id, label })),
        ...SELECTS.map(([id, label, opts]): Filter => ({
          type: 'select',
          id,
          label,
          options: opts.map(([l, value]) => ({ value, label: l })),
        })),
        { type: 'separator' },
        ...CHECKS.map(([id, label]): Filter => ({ type: 'checkbox', id, label })),
      ];
    },
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const q: string[] = [];
      if (query.trim()) q.push(`word=${encodeURIComponent(query)}`);
      for (const [id] of TEXTS) {
        const v = filters[id];
        if (typeof v === 'string' && v.trim()) q.push(`${id}=${encodeURIComponent(v)}`);
      }
      for (const [id] of SELECTS) {
        const v = filters[id];
        if (typeof v === 'string' && v) q.push(`${id}=${encodeURIComponent(v)}`);
      }
      for (const [id] of CHECKS) if (filters[id] === true) q.push(`${id}=1`);
      q.push(`page=${page}`);
      return parseSearch((await load(`${BASE_URL}/search/result?${q.join('&')}`)).doc);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { doc } = await load(`${BASE_URL}${manga.url}?page=1&order=down`);
      const genres: string[] = [];
      const mark = doc.selectFirst('a.comic_mark_thum')?.text().trim();
      if (mark) genres.push(mark);
      for (const a of doc.select('div.category_line_f_r_l.genre_detail a')) genres.push(a.text().trim());
      return {
        url: manga.url,
        title: doc.selectFirst('section.brCramb a[href^=/title/]')?.text().trim() ?? manga.title,
        author:
          doc
            .select('div.title_details_author_name a')
            .map((a) => a.text().trim())
            .join(', ') || undefined,
        description: doc.selectFirst('div#comic_description > p')?.text().trim() || undefined,
        genres,
        status: doc.selectFirst('div.volume')?.text().includes('完結') ? 'completed' : 'ongoing',
        thumbnailUrl: doc.selectFirst('div.thumBox img')?.absUrl('src') ?? manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const first = (await load(`${BASE_URL}${manga.url}?page=1&order=down`)).doc;
      const hideLocked = prefs.get<boolean>(HIDE_LOCKED) === true;
      const lastPage = Math.max(
        1,
        ...first
          .select('div.pagination li a')
          .map((a) => parseInt(a.text(), 10))
          .filter((n) => Number.isFinite(n)),
      );
      const docs: Doc[] = [first];
      for (let p = 2; p <= lastPage; p++) docs.push((await load(`${BASE_URL}${manga.url}?page=${p}&order=down`)).doc);
      const seriesTitle = (first.selectFirst('section.brCramb a[href^=/title/]')?.text() ?? '')
        .replace(/　/g, ' ')
        .trim();
      const chapters: Chapter[] = [];
      for (const doc of docs) {
        for (const el of doc.select('ul.title_vol_vox_vols li')) {
          const img = el.selectFirst('div.thum_box img')?.absUrl('src');
          const link = el.selectFirst('h3.title_details_title_name_h2 a');
          if (!img || !link) continue;
          const id = img.slice(img.lastIndexOf('/') + 1).split('.')[0]!;
          const volume = ownText(link).replace(/　/g, ' ');
          let raw = volume.startsWith(seriesTitle) ? volume.slice(seriesTitle.length) : volume;
          raw = raw.replace(/^[\s:：]+|[\s:：]+$/g, '') || volume;
          const free = el.selectFirst('div.GA_free.free, div.title_vol_btn_box_w a[href*=browserviewer]') != null;
          const preview = el.selectFirst('div.GA_free') != null;
          if (hideLocked && !free) continue;
          chapters.push({
            url: `/reader/browserviewer/content_id/${id}/`,
            name: free ? raw : preview ? `🔒 (Preview) ${raw}` : `🔒 ${raw}`,
          });
        }
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { doc, url } = await load(absoluteUrl(BASE_URL, chapter.url));
      if (url.includes('/bib/reader')) throw new Error('Novels are not supported.');
      const pages = await speedBinbPagesFromDocument(doc, url, { headers });
      if (!pages.length) throw new Error('Log in via WebView and purchase this product to read.');
      return pages;
    },
    transformImage: speedBinbTransform,
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
