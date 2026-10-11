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
import { USER_AGENT, relativeUrl } from './common/utils';
import { speedBinbPagesFromDocument, speedBinbTransform } from './speedbinb';

const BASE_URL = 'https://gaugau.futabanet.jp';
const TAGS = [
  'ジャンル',
  'なし',
  '転生・召喚',
  '少年向け',
  '青年向け',
  '大人向け',
  '少女向け',
  '追放',
  '女性向け',
  'チート',
  'もふもふ',
  '小説',
  'スローライフ',
  '時代物',
  '異世界転生',
  '官能',
  '歴史',
  'ライトノベル',
  '婚約破棄',
  '暮らし',
  '料理',
  '結婚',
  '医療',
  '恋',
  '溺愛',
  '教養',
  'ミリタリー',
  '逆ハーレム',
  '戦争',
  '寝取られ',
  'おっぱい',
  '趣味',
  '巨乳',
  'ファッション',
  'グルメ',
  'TS',
  '最強',
  '天才',
  '勇者',
  '癒し',
  '魔王',
  '雑学',
  '女主人公',
  '成り上がり',
  '探偵',
  '引きこもり',
  '社畜',
  'ツンデレ',
  '子育て',
  'ヤンデレ',
  '絵本',
  '青年',
  '女性',
  '少女',
  '少年',
  'アウトドア',
  'おっさん',
  'スポーツ',
  'トレーニング',
  '幼馴染',
  '同級生',
  'ダイエット',
  '高校生',
  '令嬢',
  '美少女',
  'エッセイ',
  '美人',
  '妹',
  '貴族',
  'イケメン',
  'ヒューマンドラマ',
  '双子',
  '冒険',
  '魔法',
  '4コマ',
  '魔女',
  'ショートショート',
  'サキュバス',
  'スライム',
  'エルフ',
  'ヤンキー',
  'ギャンブル',
  '獣人',
  'サブカル',
  'ミステリー',
  '乙女ゲーム',
  'サスペンス',
  'シリアス',
  'ホラー',
  'ラブコメ',
  '恋愛',
  '胸キュン',
  'いじめ',
  'アクション',
  'サバイバル',
  'バトル',
  '絶望',
  'アニメ',
  'ギャグ',
  '動物',
  '猫',
  '非異世界',
  '百合',
  '内政',
  'BL',
  'ダンジョン',
  '幼なじみ',
  '田舎',
  '学園',
  '悪役令嬢',
  'なろう',
  '異世界',
  'メディアミックス',
  'ファンタジー',
  'お仕事もの',
  '人外',
  'オフィスラブ',
  '日常',
  '夫婦',
  '家族',
  'アラサー',
  'アラフォー',
  '中高年',
  '老後',
  '話題',
  '重版',
  '音楽',
  '幕末',
  'お金',
  '長期連載',
  '読み切り',
  '1話完結',
  'ゲーム',
  '人情',
  'ハーレム',
];

const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string) {
  const res = await http.get(url, { headers });
  return { doc: html.load(res.body, { baseUrl: res.url }), url: res.url };
}

function parsePage(doc: ReturnType<typeof html.load>): MangaPage {
  const items: MangaSummary[] = [];
  for (const box of doc.select('.works__grid .list__box')) {
    const link = box.selectFirst('h4 a');
    if (!link) continue;
    items.push({
      url: relativeUrl(link.absUrl('href') ?? ''),
      title: link.text().trim(),
      thumbnailUrl: box.selectFirst('.thumbnail .img-books')?.absUrl('src'),
    });
  }
  return { items, hasNextPage: doc.selectFirst("ol.pagination li.next a:not([href='#'])") != null };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    imageHeaders: () => headers,
    async getPopular(page) {
      return parsePage((await load(`${BASE_URL}/list/works?page=${page}`)).doc);
    },
    getFilters(): Filter[] {
      return [
        { type: 'header', label: 'フリーワード検索はジャンル検索では機能しません' },
        {
          type: 'select',
          id: 'tag',
          label: 'ジャンル',
          options: TAGS.map((t, i) => ({ value: i === 0 ? '' : t, label: t })),
        },
      ];
    },
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const tag = typeof filters.tag === 'string' ? filters.tag : '';
      let url: string;
      if (query.trim()) url = `${BASE_URL}/list/search-result?word=${encodeURIComponent(query)}`;
      else if (tag) url = `${BASE_URL}/list/tag/${encodeURIComponent(tag)}`;
      else url = `${BASE_URL}/list/works`;
      if (page > 1) url += `${url.includes('?') ? '&' : '?'}page=${page}`;
      return parsePage((await load(url)).doc);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { doc } = await load(`${BASE_URL}${manga.url}/episodes`);
      const desc = doc.selectFirst('p.mbOff')?.text().trim();
      return {
        url: manga.url,
        title: doc.selectFirst('.mbOff h1')?.text().trim() ?? manga.title,
        author:
          doc
            .select('.list__text span a')
            .map((a) => a.text().trim())
            .join(', ') || undefined,
        description: desc || undefined,
        genres: doc.select('.list__text .tag__item').map((t) => t.text().trim()),
        thumbnailUrl: doc.selectFirst('.list__box .thumbnail .img-books')?.absUrl('src') ?? manga.thumbnailUrl,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { doc } = await load(`${BASE_URL}${manga.url}/episodes`);
      const chapters: Chapter[] = [];
      for (const grid of doc.select('#episodes .episode__grid')) {
        if (grid.selectFirst('.episode__button-app, .episode__button-complete')) continue;
        const a = grid.selectFirst('a');
        if (!a) continue;
        const num = a.selectFirst('.episode__num')?.text().trim() ?? '';
        const title = a.selectFirst('.episode__title')?.text().trim();
        const m = /^第(\d+)話\((\d+)\)$/.exec(num);
        chapters.push({
          url: relativeUrl(a.absUrl('href') ?? ''),
          name: title ? `${num}「${title}」` : num,
          number: m ? Number(m[1]) + Number(m[2]) / 10 : undefined,
        });
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { doc, url } = await load(`${BASE_URL}${chapter.url}`);
      return speedBinbPagesFromDocument(doc, url, { headers });
    },
    transformImage: speedBinbTransform,
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
