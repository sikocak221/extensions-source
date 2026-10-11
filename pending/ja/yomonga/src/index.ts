import {
  type Chapter,
  type Filter,
  type FilterState,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, relativeUrl } from './common/utils';
import { descramblePage, fetchPages } from './speedbinb';

const BASE_URL = 'https://www.yomonga.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const AUTHOR_ROLE_REGEX = /^(漫画|原作|キャラクター原案)：/;

/** [label, query parameter, value] */
const OPTIONS: [string, string, string][] = [
  ['指定なし', '', ''],
  ['試し読み', 'category_id', '3'],
  ['連載中', 'category_id', '1'],
  ['リバイバル連載', 'category_id', '2'],
  ['連載終了', 'category_id', '4'],
  ['今だけ無料', 'tag_id', '147'],
  ['オリジナル作品', 'tag_id', '1'],
  ['ドラマ化', 'tag_id', '8'],
  ['女性向け', 'tag_id', '2'],
  ['グルメ', 'tag_id', '49'],
  ['男性向け', 'tag_id', '3'],
  ['エッセイ', 'tag_id', '4'],
  ['TL', 'tag_id', '5'],
  ['BL', 'tag_id', '6'],
  ['コミカライズ', 'tag_id', '152'],
  ['美少女', 'tag_id', '12'],
  ['異世界', 'tag_id', '20'],
  ['#DOELO', 'tag_id', '26'],
  ['転生', 'tag_id', '29'],
  ['闘病', 'tag_id', '35'],
  ['オフィスラブ', 'tag_id', '36'],
  ['H', 'tag_id', '38'],
  ['水商売', 'tag_id', '45'],
  ['感動', 'tag_id', '51'],
  ['ドS', 'tag_id', '59'],
  ['夫婦問題', 'tag_id', '63'],
  ['結婚', 'tag_id', '65'],
  ['コメディ', 'tag_id', '72'],
  ['実録', 'tag_id', '75'],
  ['家族', 'tag_id', '80'],
  ['育児', 'tag_id', '85'],
  ['サスペンス', 'tag_id', '88'],
  ['心霊', 'tag_id', '90'],
  ['ホラー', 'tag_id', '151'],
  ['虐待', 'tag_id', '93'],
  ['復讐', 'tag_id', '102'],
  ['恋愛', 'tag_id', '110'],
  ['ファンタジー', 'tag_id', '114'],
  ['調教', 'tag_id', '117'],
  ['OL', 'tag_id', '122'],
  ['イケメン', 'tag_id', '127'],
  ['ラブコメ', 'tag_id', '131'],
  ['学園', 'tag_id', '132'],
  ['BKコミックス', 'tag_id', '138'],
  ['読み切り', 'tag_id', '143'],
  ['スカッと', 'tag_id', '148'],
  ['ボイスコミックあり', 'tag_id', '149'],
  ['広告掲載中', 'tag_id', '150'],
];

const load = async (url: string) => {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
};

async function list(url: string): Promise<MangaPage> {
  const doc = await load(url);
  return {
    items: doc.select('div.book-box4').map((box) => ({
      url: relativeUrl(box.selectFirst('a')?.absUrl('href') ?? ''),
      title: box.selectFirst('div.book-box4-title')?.text() ?? '',
      thumbnailUrl: box.selectFirst('img.book-box4-thumbnail')?.absUrl('src'),
    })),
    hasNextPage: doc.selectFirst('.paging-next.paging-click') !== null,
  };
}

const queryParam = (url: string, name: string) => new RegExp(`[?&]${name}=([^&#]*)`).exec(url)?.[1];

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`${BASE_URL}/titles/?page_num=${page}`),
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'group',
        label: 'カテゴリ・キーワード',
        options: OPTIONS.map(([label, param, value]) => ({ label, value: `${param}=${value}` })),
        default: '=',
      },
    ],
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      let url = `${BASE_URL}/titles/?page_num=${page}`;
      if (query.trim()) url += `&search_word=${encodeURIComponent(query)}`;
      else {
        const group = typeof filters.group === 'string' ? filters.group : '=';
        if (group !== '=' && group.includes('=')) url += `&${group}`;
      }
      return list(url);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const doc = await load(BASE_URL + manga.url);
      const genres = doc.select('.tag-wrapper .tag').map((t) => t.text());
      const joined = genres.join(',');
      const status: MangaStatus = joined.includes('連載中')
        ? 'ongoing'
        : joined.includes('連載終了')
          ? 'completed'
          : 'unknown';
      return {
        url: manga.url,
        title: doc.selectFirst('.intr-title')?.text() ?? manga.title,
        author:
          doc
            .select('.intr-writer')
            .map((w) => w.text().replace(AUTHOR_ROLE_REGEX, '').trim())
            .join(', ') || undefined,
        description: doc.selectFirst('.intr-text > .intr-desc')?.text() || undefined,
        genres,
        status,
        thumbnailUrl: doc.selectFirst('.intr-thumbnail')?.absUrl('src') ?? manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const doc = await load(BASE_URL + manga.url);
      const chapters: Chapter[] = [];
      for (const ep of doc.select('.episode-list[data-episode_no]')) {
        const link = ep.selectFirst('a.button-type1')?.absUrl('href') ?? '';
        const cid = queryParam(link, 'cid');
        const title = relativeUrl(link).split('/')[2];
        if (!cid) continue;
        chapters.push({ url: `${title}/${cid}`, name: ep.selectFirst('.episode-name')?.text() ?? cid });
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const cid = chapter.url.split('/')[1] ?? '';
      const pages = await fetchPages(`${BASE_URL}/binb/sws/apis/bibGetCntntInfo.php`, cid, headers);
      if (!pages.length) throw new Error('Log in via WebView and purchase this chapter to read.');
      return pages;
    },
    imageHeaders: () => headers,
    transformImage: (page: Page, bytes: Uint8Array): ImageTransform => descramblePage(page, bytes),
    resolveUrl(url: string): MangaSummary | null {
      const path = relativeUrl(url.replace(/[?#].*/, ''));
      return hostOf(url).endsWith('yomonga.com') && /^\/titles\/[^/]+\/?$/.test(path) ? { url: path, title: '' } : null;
    },
    getWebUrl(item): string {
      if ('name' in item) {
        const [title, cid] = item.url.split('/');
        return `${BASE_URL}/titles/${title}/?episode=${cid}&cid=${cid}`;
      }
      return BASE_URL + item.url;
    },
  }),
});
