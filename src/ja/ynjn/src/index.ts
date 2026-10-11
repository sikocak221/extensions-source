import {
  type Chapter,
  type Filter,
  type FilterState,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type TileOp,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf } from './common/utils';
import { imageSize } from './image';

const BASE_URL = 'https://ynjn.jp';
const API = 'https://webapi.ynjn.jp';
const HIDE_LOCKED = 'hide_locked';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

/** [label, type, value] */
const CATEGORIES: [string, string, string][] = [
  ['ウルトラジャンプ', 'LABEL', '9'],
  ['ヤングジャンプ', 'LABEL', '10'],
  ['グランドジャンプ', 'LABEL', '15'],
  ['ヤンジャン＋オリジナル作品', 'LABEL', '17'],
  ['異世界ヤンジャン', 'LABEL', '6'],
  ['となりのヤングジャンプ', 'LABEL', '2'],
  ['キャプテン翼WORLD', 'LABEL', '22'],
  ['本宮ひろ志漫画大全集', 'LABEL', '23'],
  ['ヒロインズ＋', 'LABEL', '25'],
  ['バトル', 'GENRE', '1'],
  ['アクション', 'GENRE', '2'],
  ['ホラー', 'GENRE', '3'],
  ['ミステリー', 'GENRE', '4'],
  ['ギャンブル', 'GENRE', '5'],
  ['頭脳ゲーム', 'GENRE', '6'],
  ['美少女', 'GENRE', '7'],
  ['お色気', 'GENRE', '8'],
  ['恋愛', 'GENRE', '9'],
  ['スポーツ', 'GENRE', '10'],
  ['青春', 'GENRE', '11'],
  ['友情', 'GENRE', '12'],
  ['お仕事もの', 'GENRE', '13'],
  ['ギャグ', 'GENRE', '14'],
  ['コメディ', 'GENRE', '15'],
  ['ラブコメ', 'GENRE', '16'],
  ['冒険', 'GENRE', '17'],
  ['医療', 'GENRE', '18'],
  ['デスゲーム', 'GENRE', '19'],
  ['アート', 'GENRE', '20'],
  ['ドラマ', 'GENRE', '21'],
  ['ウマ娘 シンデレラグレイと合わせて読みたい作品', 'GENRE', '23'],
  ['異世界', 'GENRE', '24'],
  ['無料チケット', 'FREE', '1'],
  ['期間限定無料', 'FREE', '2'],
  ['無料読切', 'FREE', '3'],
  ['全話無料', 'FREE', '5'],
  ['長編', 'KEYWORD', '1'],
  ['短編', 'KEYWORD', '2'],
  ['オムニバス', 'KEYWORD', '3'],
  ['縦スクロール', 'KEYWORD', '4'],
  ['4コマ', 'KEYWORD', '5'],
  ['続編', 'KEYWORD', '6'],
  ['番外編／外伝', 'KEYWORD', '7'],
  ['スピンオフ', 'KEYWORD', '8'],
  ['コミカライズ', 'KEYWORD', '9'],
  ['男性向け', 'KEYWORD', '10'],
  ['女性向け', 'KEYWORD', '11'],
  ['連載中', 'KEYWORD', '12'],
  ['完結作', 'KEYWORD', '13'],
  ['エッセイ', 'KEYWORD', '14'],
  ['少女漫画', 'KEYWORD', '15'],
  ['自伝', 'KEYWORD', '16'],
  ['読切', 'KEYWORD', '17'],
  ['SF', 'KEYWORD', '18'],
  ['歴史', 'KEYWORD', '19'],
  ['ファンタジー', 'KEYWORD', '20'],
  ['グルメ', 'KEYWORD', '21'],
  ['日常', 'KEYWORD', '22'],
  ['音楽', 'KEYWORD', '23'],
  ['芸能', 'KEYWORD', '24'],
  ['異世界転生', 'KEYWORD', '25'],
  ['サスペンス', 'KEYWORD', '26'],
  ['宇宙', 'KEYWORD', '27'],
  ['未来', 'KEYWORD', '28'],
  ['過去', 'KEYWORD', '29'],
  ['学園', 'KEYWORD', '30'],
  ['時代劇', 'KEYWORD', '31'],
  ['裏社会', 'KEYWORD', '32'],
  ['アングラ', 'KEYWORD', '33'],
  ['サイバー', 'KEYWORD', '34'],
  ['BL', 'KEYWORD', '35'],
  ['百合', 'KEYWORD', '36'],
  ['ドキュメンタリー', 'KEYWORD', '37'],
  ['ダーク', 'KEYWORD', '38'],
  ['オカルト', 'KEYWORD', '39'],
  ['プロフェッショナル', 'KEYWORD', '40'],
  ['社会派', 'KEYWORD', '41'],
  ['不良', 'KEYWORD', '42'],
  ['動物', 'KEYWORD', '43'],
  ['部活', 'KEYWORD', '44'],
  ['ファッション', 'KEYWORD', '45'],
  ['格闘技', 'KEYWORD', '46'],
  ['野球', 'KEYWORD', '47'],
  ['サッカー', 'KEYWORD', '48'],
  ['ボクシング', 'KEYWORD', '49'],
  ['異能力', 'KEYWORD', '50'],
  ['ヒューマンドラマ', 'KEYWORD', '51'],
  ['ハーレム', 'KEYWORD', '52'],
  ['不倫', 'KEYWORD', '53'],
  ['お酒', 'KEYWORD', '54'],
  ['推理', 'KEYWORD', '55'],
  ['神様', 'KEYWORD', '56'],
  ['趣味', 'KEYWORD', '57'],
  ['剣と魔法', 'KEYWORD', '58'],
  ['女子高生', 'KEYWORD', '59'],
  ['ほのぼの', 'KEYWORD', '60'],
  ['死闘', 'KEYWORD', '61'],
  ['剣劇', 'KEYWORD', '62'],
  ['型破り', 'KEYWORD', '63'],
  ['天才', 'KEYWORD', '64'],
  ['スポ根', 'KEYWORD', '65'],
  ['アイドル', 'KEYWORD', '66'],
  ['昭和', 'KEYWORD', '67'],
  ['平成', 'KEYWORD', '68'],
  ['明治・大正', 'KEYWORD', '69'],
  ['戦国', 'KEYWORD', '70'],
  ['飛鳥・奈良・平安時代', 'KEYWORD', '71'],
  ['異世界', 'KEYWORD', '72'],
  ['世界史', 'KEYWORD', '73'],
  ['鎌倉時代', 'KEYWORD', '74'],
  ['江戸時代', 'KEYWORD', '75'],
  ['幕末', 'KEYWORD', '76'],
  ['テニス', 'KEYWORD', '77'],
  ['ゴルフ', 'KEYWORD', '78'],
  ['ダンス', 'KEYWORD', '79'],
  ['復讐', 'KEYWORD', '80'],
  ['サバイバル', 'KEYWORD', '81'],
  ['旅', 'KEYWORD', '82'],
  ['ロボット', 'KEYWORD', '83'],
  ['教師', 'KEYWORD', '84'],
  ['弁護士', 'KEYWORD', '85'],
  ['ヒーロー', 'KEYWORD', '86'],
  ['ボウリング', 'KEYWORD', '87'],
  ['宇宙人', 'KEYWORD', '88'],
  ['死', 'KEYWORD', '89'],
  ['魔法', 'KEYWORD', '90'],
  ['演劇', 'KEYWORD', '91'],
  ['社畜', 'KEYWORD', '92'],
  ['ゴージャス', 'KEYWORD', '93'],
  ['ダークヒーロー', 'KEYWORD', '94'],
  ['職人', 'KEYWORD', '95'],
  ['犬', 'KEYWORD', '96'],
  ['猫', 'KEYWORD', '97'],
  ['怪獣', 'KEYWORD', '98'],
  ['フェチ', 'KEYWORD', '99'],
  ['お金', 'KEYWORD', '100'],
  ['ビジネス', 'KEYWORD', '101'],
  ['警察', 'KEYWORD', '102'],
  ['銃撃', 'KEYWORD', '103'],
  ['バドミントン', 'KEYWORD', '104'],
  ['妖怪', 'KEYWORD', '105'],
  ['幽霊', 'KEYWORD', '106'],
  ['お役所', 'KEYWORD', '107'],
  ['吸血鬼', 'KEYWORD', '108'],
  ['オリンピック', 'KEYWORD', '109'],
  ['カポエイラ', 'KEYWORD', '110'],
  ['大学生', 'KEYWORD', '111'],
  ['モンゴル相撲', 'KEYWORD', '112'],
  ['卓球', 'KEYWORD', '113'],
  ['馬', 'KEYWORD', '114'],
  ['悪魔', 'KEYWORD', '115'],
  ['擬人化', 'KEYWORD', '116'],
  ['柔道', 'KEYWORD', '117'],
  ['OL', 'KEYWORD', '118'],
  ['スイーツ', 'KEYWORD', '119'],
  ['合気道', 'KEYWORD', '120'],
  ['群像劇', 'KEYWORD', '121'],
  ['競馬', 'KEYWORD', '122'],
  ['受験', 'KEYWORD', '123'],
  ['入れ替わり', 'KEYWORD', '124'],
  ['お寺', 'KEYWORD', '125'],
  ['忍者', 'KEYWORD', '126'],
  ['タイムスリップ', 'KEYWORD', '127'],
  ['中二病', 'KEYWORD', '128'],
  ['子育て', 'KEYWORD', '129'],
  ['家族', 'KEYWORD', '130'],
  ['ループ', 'KEYWORD', '131'],
  ['漫画家', 'KEYWORD', '132'],
  ['車', 'KEYWORD', '133'],
  ['ニート', 'KEYWORD', '134'],
  ['海', 'KEYWORD', '135'],
  ['山', 'KEYWORD', '136'],
  ['小説家', 'KEYWORD', '137'],
  ['映画', 'KEYWORD', '138'],
  ['殺し屋', 'KEYWORD', '139'],
  ['宗教', 'KEYWORD', '140'],
  ['実在', 'KEYWORD', '141'],
  ['不死', 'KEYWORD', '143'],
  ['南国', 'KEYWORD', '144'],
  ['戦争', 'KEYWORD', '145'],
  ['詐欺師', 'KEYWORD', '146'],
  ['役者', 'KEYWORD', '147'],
  ['将棋', 'KEYWORD', '148'],
  ['パイロット', 'KEYWORD', '149'],
  ['空', 'KEYWORD', '150'],
  ['いじめ', 'KEYWORD', '151'],
  ['ウィンタースポーツ', 'KEYWORD', '152'],
  ['ゾンビ', 'KEYWORD', '153'],
  ['虫', 'KEYWORD', '154'],
  ['政治', 'KEYWORD', '155'],
  ['小動物系女子', 'KEYWORD', '156'],
  ['人妻', 'KEYWORD', '157'],
  ['厳しめお姉さん', 'KEYWORD', '158'],
  ['守ってあげたい女子', 'KEYWORD', '159'],
  ['妹系', 'KEYWORD', '160'],
  ['ツンデレ', 'KEYWORD', '161'],
  ['ヤンデレ', 'KEYWORD', '162'],
  ['賢い系女子', 'KEYWORD', '163'],
  ['癒やし系女子', 'KEYWORD', '164'],
  ['バブみを感じてオギャる', 'KEYWORD', '165'],
  ['母性', 'KEYWORD', '166'],
  ['お姉さん系', 'KEYWORD', '167'],
  ['コミュ障', 'KEYWORD', '168'],
  ['強い女子', 'KEYWORD', '169'],
  ['友人', 'KEYWORD', '170'],
  ['幼馴染', 'KEYWORD', '171'],
  ['年下女子', 'KEYWORD', '172'],
  ['LGBTQ', 'KEYWORD', '173'],
  ['元気系女子', 'KEYWORD', '174'],
  ['夜の女', 'KEYWORD', '175'],
  ['謎女子', 'KEYWORD', '176'],
  ['元カノ', 'KEYWORD', '177'],
  ['夫婦', 'KEYWORD', '178'],
  ['姉妹', 'KEYWORD', '179'],
  ['腐女子', 'KEYWORD', '180'],
  ['女装', 'KEYWORD', '181'],
  ['たぎる', 'KEYWORD', '182'],
  ['泣ける', 'KEYWORD', '183'],
  ['燃える', 'KEYWORD', '184'],
  ['笑える', 'KEYWORD', '185'],
  ['エモい', 'KEYWORD', '186'],
  ['ハラハラ', 'KEYWORD', '187'],
  ['ドキドキ', 'KEYWORD', '188'],
  ['切ない', 'KEYWORD', '189'],
  ['ほっこり', 'KEYWORD', '190'],
  ['萌える', 'KEYWORD', '191'],
  ['スカッとする', 'KEYWORD', '192'],
  ['怖い', 'KEYWORD', '193'],
  ['ためになる', 'KEYWORD', '194'],
  ['シュール', 'KEYWORD', '195'],
  ['きゅんとする', 'KEYWORD', '196'],
  ['モラハラ', 'KEYWORD', '197'],
  ['DV', 'KEYWORD', '198'],
  ['令和', 'KEYWORD', '199'],
  ['魔物', 'KEYWORD', '200'],
  ['追放', 'KEYWORD', '201'],
  ['無双', 'KEYWORD', '202'],
  ['チート', 'KEYWORD', '203'],
  ['剣', 'KEYWORD', '204'],
  ['転生', 'KEYWORD', '205'],
  ['オタク', 'KEYWORD', '206'],
  ['推し活', 'KEYWORD', '207'],
  ['おじさん', 'KEYWORD', '208'],
  ['令嬢', 'KEYWORD', '209'],
  ['タワマン文学', 'KEYWORD', '210'],
  ['任侠', 'KEYWORD', '211'],
  ['おとなしい女子', 'KEYWORD', '212'],
  ['重め女子', 'KEYWORD', '213'],
  ['少年・少女', 'KEYWORD', '215'],
  ['学生', 'KEYWORD', '216'],
  ['獣耳女子', 'KEYWORD', '217'],
  ['配信者', 'KEYWORD', '218'],
  ['清楚系', 'KEYWORD', '219'],
  ['潔癖', 'KEYWORD', '220'],
  ['綺麗め女子', 'KEYWORD', '221'],
  ['ギャル', 'KEYWORD', '222'],
  ['AI', 'KEYWORD', '223'],
  ['魔法少女', 'KEYWORD', '224'],
  ['成り上がり', 'KEYWORD', '225'],
  ['同僚', 'KEYWORD', '226'],
  ['歳の差', 'KEYWORD', '227'],
  ['コスプレ', 'KEYWORD', '228'],
  ['勇者', 'KEYWORD', '229'],
  ['えげつない', 'KEYWORD', '230'],
  ['えぐい', 'KEYWORD', '231'],
  ['ワクワク', 'KEYWORD', '232'],
  ['苦しい', 'KEYWORD', '233'],
  ['見守りたい', 'KEYWORD', '234'],
  ['悪役令嬢', 'KEYWORD', '235'],
  ['聖女', 'KEYWORD', '236'],
  ['サラリーマン', 'KEYWORD', '237'],
  ['神社', 'KEYWORD', '238'],
  ['サイエンス', 'KEYWORD', '239'],
  ['編集者', 'KEYWORD', '240'],
  ['兄弟', 'KEYWORD', '241'],
  ['1990年代', 'GENERATION', '1990'],
  ['2000年代', 'GENERATION', '2000'],
  ['2010年代', 'GENERATION', '2010'],
  ['2020年代', 'GENERATION', '2020'],
];

interface TitleDto {
  id: number;
  image_url: string;
  name: string;
}

const get = async <T>(path: string): Promise<T> =>
  (await http.get<T>(`${API}${path}`, { headers, responseType: 'json' })).body;

const summary = (t: TitleDto): MangaSummary => ({ url: `/title/${t.id}`, title: t.name, thumbnailUrl: t.image_url });
const idOf = (url: string) => /(\d+)\/?$/.exec(url)?.[1] ?? url;

let latestFeature: { date: string; id: number } | undefined;
const todayJst = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);

export default defineExtension({
  preferences: () => [{ type: 'switch', key: HIDE_LOCKED, label: 'Hide Locked Chapters', default: false }],
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const r = await get<{ data: { ranking: { titles: { title: TitleDto }[] } } }>(
        '/title/ranking?id=1742&type=LIST&rankingType=RANKING',
      );
      return { items: r.data.ranking.titles.map((t) => summary(t.title)), hasNextPage: false };
    },
    async getLatest(page: number): Promise<MangaPage> {
      const today = todayJst();
      if (latestFeature?.date !== today) {
        const f = await get<{ data: { info?: { id: number } } }>('/title/feature?displayLocation=TOP_PAGE_RENSAI');
        latestFeature = { date: today, id: f.data.info!.id };
      }
      const r = await get<{ data: { has_next?: boolean; titles: TitleDto[] } }>(
        `/title/feature?id=${latestFeature.id}&page=${page}`,
      );
      return { items: r.data.titles.map(summary), hasNextPage: r.data.has_next === true };
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'category',
        label: 'Category',
        options: CATEGORIES.map(([label, type, value]) => ({ label, value: `${type}:${value}` })),
        default: `${CATEGORIES[0]![1]}:${CATEGORIES[0]![2]}`,
      },
    ],
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const category =
        typeof filters.category === 'string' ? filters.category : `${CATEGORIES[0]![1]}:${CATEGORIES[0]![2]}`;
      const [type, value] = category.split(':');
      const path = query.trim()
        ? `/title/category/TEXT?text=${encodeURIComponent(query)}&page=${page}&sort=POPULARITY`
        : `/title/category/${type}?id=${value}&page=${page}&sort=POPULARITY`;
      const r = await get<{ data: { titles: TitleDto[]; total_count: number } }>(path);
      const items = r.data.titles.map(summary);
      return { items, hasNextPage: (page - 1) * 12 + items.length < r.data.total_count };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const r = await get<{
        data: {
          book: {
            author?: string[] | null;
            image_url?: string | null;
            name: string;
            summary?: string | null;
            tags?: { value: string }[] | null;
            title_id: number;
          };
        };
      }>(`/book/${idOf(manga.url)}`);
      const b = r.data.book;
      return {
        url: manga.url,
        title: b.name,
        thumbnailUrl: b.image_url ?? manga.thumbnailUrl,
        author: b.author?.join(', '),
        description: b.summary ?? undefined,
        genres: b.tags?.map((t) => t.value),
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const hide = prefs.get<boolean>(HIDE_LOCKED) === true;
      const id = idOf(manga.url);
      const r = await get<{ data: { episodes: { id: number; name: string; reading_condition: string }[] } }>(
        `/title/${id}/episode?isGetAll=true`,
      );
      return r.data.episodes
        .map((e) => ({ locked: e.reading_condition !== 'EPISODE_READ_CONDITION_FREE', e }))
        .filter(({ locked }) => !hide || !locked)
        .map(({ locked, e }) => ({ url: `${id}/${e.id}`, name: (locked ? '🔒 ' : '') + e.name }))
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [titleId, episodeId] = chapter.url.split('/');
      const r = await get<{
        data: { pages: { manga_page?: { page_image_url: string; page_number: number } | null }[] };
      }>(`/viewer?titleId=${titleId}&episodeId=${episodeId}`);
      if (!r.data.pages.length) throw new Error('Log in via WebView and purchase this chapter to read.');
      return r.data.pages
        .map((p) => p.manga_page)
        .filter((p): p is { page_image_url: string; page_number: number } => !!p)
        .sort((a, b) => a.page_number - b.page_number)
        .map((p, index) => ({ index, imageUrl: `${p.page_image_url}#scramble` }));
    },
    imageHeaders: () => headers,
    /** The image is a 4x4 grid whose rows and columns are transposed. */
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      if (!(page.imageUrl ?? '').endsWith('#scramble')) return {};
      const size = imageSize(bytes);
      if (!size) return {};
      const [width, height] = size;
      const bw = Math.floor(width / 4);
      const bh = Math.floor(height / 4);
      const ops: TileOp[] = [];
      for (let i = 0; i < 16; i++) {
        const row = Math.floor(i / 4);
        const col = i % 4;
        ops.push({ sx: col * bw, sy: row * bh, w: bw, h: bh, dx: row * bw, dy: col * bh });
      }
      return { tiles: { width, height, ops } };
    },
    resolveUrl(url: string): MangaSummary | null {
      const id = /\/title\/(\d+)/.exec(url)?.[1];
      return hostOf(url) === hostOf(BASE_URL) && id ? { url: `/title/${id}`, title: '' } : null;
    },
    getWebUrl(item): string {
      if ('name' in item) {
        const [titleId, episodeId] = item.url.split('/');
        return `${BASE_URL}/viewer/${titleId}/${episodeId}`;
      }
      return BASE_URL + item.url;
    },
  }),
});
