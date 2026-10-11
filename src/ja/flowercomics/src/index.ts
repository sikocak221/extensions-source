import {
  type Chapter,
  type Filter,
  type FilterState,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, findRscObject, parseDate } from './common/utils';

const BASE_URL = 'https://flowercomics.jp';
const HIDE_LOCKED = 'hide_locked';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const rscHeaders = { ...headers, rsc: '1' };

const CATEGORIES: [string, string, string][] = [
  ['月', 'day', 'mon'],
  ['火', 'day', 'tue'],
  ['水', 'day', 'wed'],
  ['木', 'day', 'thu'],
  ['金', 'day', 'fri'],
  ['土', 'day', 'sat'],
  ['日', 'day', 'sun'],
  ['完結', 'rensai', 'completed'],
  ['よみきり', 'rensai', 'one-shot'],
  ['Ｓｈｏ－Ｃｏｍｉ', 'label', '3'],
  ['Sho-ComiX', 'label', '6'],
  ['＆フラワー[1]', 'label', '9'],
  ['Ｃｈｅｅｓｅ！', 'label', '12'],
  ['プレミアCheese！', 'label', '15'],
  ['＆フラワー[2]', 'label', '18'],
  ['ベツコミ', 'label', '21'],
  ['ベツフラ[1]', 'label', '24'],
  ['＆フラワー[3]', 'label', '27'],
  ['プチコミック', 'label', '30'],
  ['姉プチ', 'label', '33'],
  ['デジプチ', 'label', '36'],
  ['月刊ｆｌｏｗｅｒｓ', 'label', '39'],
  ['flowers増刊', 'label', '42'],
  ['ベツフラ[2]', 'label', '45'],
  ['妻プチ', 'label', '48'],
  ['モバフラ', 'label', '51'],
  ['その他', 'label', '54'],
  ['オリジナル', 'label', '57'],
  ['＆フラワー[4]', 'label', '58'],
  ['プチコミック増刊', 'label', '59'],
  ['プチプチ', 'label', '62'],
  ['デラックスベツコミ', 'label', '65'],
  ['恋愛/学園', 'tag', '1'],
  ['リアルな恋、理想の恋…あなたはどのタイプ？ 大人の恋愛特集', 'tag', '4'],
  ['恋愛/コメディ', 'tag', '7'],
  ['恋愛/オフィス', 'tag', '10'],
  ['恋愛', 'tag', '13'],
  ['青春・友情', 'tag', '16'],
  ['ＢＬ・ブロマンス', 'tag', '19'],
  ['ＧＬ', 'tag', '22'],
  ['ミステリー・推理', 'tag', '25'],
  ['ファンタジー', 'tag', '28'],
  ['歴史・時代モノ', 'tag', '31'],
  ['転生', 'tag', '34'],
  ['どうぶつ', 'tag', '37'],
  ['人外・異種族', 'tag', '40'],
  ['バース系・特殊設定', 'tag', '43'],
  ['同居', 'tag', '44'],
  ['溺愛', 'tag', '47'],
  ['クール男子', 'tag', '50'],
  ['メディア化', 'tag', '53'],
  ['家族・結婚', 'tag', '56'],
  ['キュン', 'tag', '59'],
  ['かわいい男子', 'tag', '62'],
  ['よみきり', 'tag', '65'],
  ['転落', 'tag', '68'],
  ['刺激的', 'tag', '71'],
  ['包容力男子', 'tag', '74'],
  ['短編集', 'tag', '77'],
  ['エモ', 'tag', '83'],
  ['メガネ男子', 'tag', '86'],
  ['イッキ読み可能♡完結作品', 'tag', '89'],
  ['禁断・背徳', 'tag', '92'],
  ['わちゃわちゃ', 'tag', '95'],
  ['いじわる男子', 'tag', '98'],
  ['エッセイ・ショート', 'tag', '101'],
  ['年の差', 'tag', '104'],
  ['ハラハラ', 'tag', '107'],
  ['クズ男子', 'tag', '110'],
  ['嫌われ', 'tag', '116'],
  ['ちょっとＨ', 'tag', '119'],
  ['ヤンデレ男子', 'tag', '122'],
  ['ざまぁ展開', 'tag', '152'],
  ['俺様・ドS', 'tag', '155'],
  ['勘違い・すれ違い', 'tag', '158'],
  ['ほんわか', 'tag', '161'],
  ['社長', 'tag', '164'],
  ['SNS', 'tag', '167'],
  ['切ない', 'tag', '170'],
  ['ハイスペ・スパダリ', 'tag', '173'],
  ['三角関係', 'tag', '176'],
  ['イケおじ', 'tag', '179'],
  ['癒し系', 'tag', '182'],
  ['アイドル・芸能人', 'tag', '185'],
  ['サスペンス', 'tag', '188'],
  ['ダーク', 'tag', '191'],
  ['日常', 'tag', '194'],
  ['ヒューマンドラマ', 'tag', '197'],
  ['アクション・格闘', 'tag', '200'],
  ['お仕事', 'tag', '203'],
  ['特殊能力', 'tag', '206'],
  ['医療・救護', 'tag', '209'],
  ['ギャグ・コメディー', 'tag', '212'],
  ['ホラー', 'tag', '215'],
  ['スポーツ', 'tag', '218'],
  ['サクセスストーリー', 'tag', '221'],
  ['政治・社会派', 'tag', '224'],
  ['グルメ', 'tag', '227'],
  ['芸術', 'tag', '230'],
  ['音楽', 'tag', '233'],
  ['身分差', 'tag', '235'],
  ['【４／５まで！】１巻分完全無料', 'tag', '238'],
  ['愛されまくり！溺愛男子', 'tag', '242'],
  ['こんな恋がしたい！憧れ学園LOVＥ', 'tag', '245'],
  ['溢れるロマン！ファンタジー作品', 'tag', '248'],
  ['この恋にはヒミツがある…禁断の愛', 'tag', '251'],
  ['予測不能？ミステリー＆サスペンス', 'tag', '254'],
  ['イッキ読み可能♡　完結作品', 'tag', '257'],
  ['沼！クズ男子', 'tag', '260'],
  ['フラコミ限定！オリジナル作品', 'tag', '263'],
  ['SNSでバズり中！話題の作品！', 'tag', '266'],
  ['現在無料キャンペーン中の作品！[1]', 'tag', '269'],
  ['現在無料キャンペーン中の作品！[2]', 'tag', '272'],
  ['現在無料キャンペーン中の作品！[3]', 'tag', '275'],
  ['現在無料キャンペーン中の作品！[4]', 'tag', '278'],
  ['現在無料キャンペーン中の作品！[5]', 'tag', '281'],
  ['現在無料キャンペーン中の作品！[6]', 'tag', '284'],
  ['期間限定無料！エッセイ・ショート', 'tag', '287'],
  ['現在無料キャンペーン中の作品！[7]', 'tag', '290'],
  ['現在無料キャンペーン中の作品！[8]', 'tag', '293'],
  ['現在無料キャンペーン中の作品！[9]', 'tag', '296'],
  ['現在無料キャンペーン中の作品！[10]', 'tag', '299'],
  ['第94回 小学館 新人コミック大賞受賞作品', 'tag', '302'],
  ['新人賞', 'tag', '305'],
  ['キミだから好き。BL特集！', 'tag', '311'],
  ['プチコミ　ショート作品 一挙新連載特集！', 'tag', '314'],
  ['間もなく無料期間終了！エッセイ・ショート', 'tag', '320'],
  ['月１作家企画・吉田秋生先生特集！', 'tag', '323'],
  ['SF', 'tag', '347'],
  ['読むなら今！萩尾望都作品無料増量中', 'tag', '350'],
  ['月１作家企画・和泉かねよし先生特集！', 'tag', '356'],
  ['食欲の秋！　飲んで食べて恋をして♡[1]', 'tag', '359'],
  ['ホラー読切特集開催中！', 'tag', '362'],
  ['超大型無料キャンペーン！漫祭２０２４[1]', 'tag', '365'],
  ['食欲の秋！　飲んで食べて恋をして♡[2]', 'tag', '368'],
  ['次のヒット作はこれ！！　１か月以内に開始した新連載作品', 'tag', '371'],
  ['超大型無料キャンペーン！漫祭２０２４[2]', 'tag', '374'],
  ['月１作家企画・朱神宝先生特集！', 'tag', '377'],
  ['超大型無料キャンペーン！漫祭２０２４[3]', 'tag', '380'],
  ['超大型無料キャンペーン！漫祭２０２４[4]', 'tag', '383'],
  ['ハロウィン全連載作品1巻無料', 'tag', '386'],
  ['溺愛＆スパダリの名手！甘宮ちか＆七海月作品特集', 'tag', '389'],
  ['月１作家企画・みつきかこ先生特集！', 'tag', '392'],
  ['連載権争奪新人よみきり選手権', 'tag', '395'],
  ['月１作家企画・北川みゆき先生特集！', 'tag', '398'],
  ['第95回 小学館 新人コミック大賞受賞作品', 'tag', '401'],
  ['人生観変わる!?長編漫画特集', 'tag', '404'],
  ['月１作家企画・くまがい杏子先生特集！', 'tag', '407'],
  ['美！和装漫画フェア', 'tag', '410'],
  ['新人賞受賞読切作品', 'tag', '413'],
  ['月１作家企画・田村由美先生特集！', 'tag', '416'],
  ['ハッピーバレンタイン！　チョコとお菓子にまつわる恋', 'tag', '419'],
  ['まずはこれ！　読者数TOP１０', 'tag', '422'],
  ['【25冬のBL特集】', 'tag', '425'],
  ['月１作家企画・藤間麗先生特集！', 'tag', '428'],
  ['特別な恋を君と。ＢＬ特集開催中！', 'tag', '431'],
  ['『BANANA FISH』４０周年！吉田秋生先生特集[1]', 'tag', '432'],
  ['月１作家企画・桜小路かのこ先生特集！', 'tag', '435'],
  ['ベツコミ５５周年記念無料キャンペーン！', 'tag', '438'],
  ['知性宿る魅力！　メガネ男子特集', 'tag', '441'],
  ['月１作家企画・小玉ユキ先生特集！', 'tag', '444'],
  ['５月限定！特選人気作無料キャンペーン', 'tag', '447'],
  ['GWたっぷり!無料!!で読める作品はコチラ!!!', 'tag', '450'],
  ['『次にくるマンガ大賞2025』　フラコミがオススメするエントリー候補作品！', 'tag', '453'],
  ['クイーンズ・クオリティ完結記念！最富キョウスケ特集', 'tag', '459'],
  ['月１作家企画・吉永ゆう先生特集！', 'tag', '462'],
  ['６月限定！特選人気作無料キャンペーン', 'tag', '465'],
  ['第96回 小学館 新人コミック大賞受賞作品', 'tag', '468'],
  ['７月限定！特選人気作無料キャンペーン', 'tag', '473'],
  ['月１作家企画・七尾美緒先生特集！', 'tag', '476'],
  ['月１作家企画・七尾美緒先生特集！読み切り作品', 'tag', '479'],
  ['創刊５５周年記念　夏恋ベツコミ', 'tag', '482'],
  ['月１作家企画・宮園いづみ先生特集！', 'tag', '485'],
  ['8/1～8/9まで毎日1話ずつ無料', 'tag', '488'],
  ['8/9～8/18まで毎日1話ずつ無料', 'tag', '491'],
  ['『BANANA FISH』４０周年！吉田秋生先生特集[2]', 'tag', '494'],
  ['ベツコミ55th　レジェンド作品大集合！', 'tag', '497'],
  ['祝画業30周年！和泉かねよし傑作無料キャンペーン', 'tag', '500'],
  ['月１作家企画・梅沢麻里奈先生特集！', 'tag', '503'],
  ['9月限定！特選人気作無料キャンペーン', 'tag', '506'],
  ['8チャプター無料！ 3/5まで！', 'tag', '509'],
  ['漫祭2025　第2弾　甘くて苦くて愛おしい…ときめきが止まらない！ラブストーリーフェア！', 'tag', '515'],
  ['漫祭2025　第4弾　男女共通！次世代の名作が勢揃い　ネクストブレイク作品フェア！！', 'tag', '518'],
  ['月１作家企画・織田綺先生特集！', 'tag', '521'],
  ['10月限定！特選人気作無料キャンペーン', 'tag', '524'],
  ['漫祭2025　第6弾　恋…だけじゃない　多彩な人間模様を描いた少女・女性漫画フェア！', 'tag', '527'],
  ['漫祭2025　第7弾 転生も令嬢も盛りだくさん！ 異世界系漫画特集!!', 'tag', '530'],
  ['漫祭2025　第8弾　イッキ読み必至！読み始めたら止まらない完結済み少女・女性漫画セレクション！', 'tag', '533'],
  ['11月限定！特選人気作無料キャンペーン', 'tag', '538'],
  ['月１作家企画・波津彬子先生特集！', 'tag', '541'],
  ['今週末スタートした無料キャンペーン作品', 'tag', '544'],
  ['もうすぐ終了！無料キャンペーン', 'tag', '547'],
  ['月１作家企画・宇佐美真紀先生特集！', 'tag', '550'],
  ['月１作家企画・水瀬 藍先生特集！', 'tag', '553'],
  ['第97回 小学館 新人コミック大賞受賞作品', 'tag', '554'],
  ['闇男子に沼りまくり♡FCフェア2025', 'tag', '557'],
  ['年始スタートした無料キャンペーン作品', 'tag', '560'],
  ['水瀬藍＆くまがい杏子画業20周年記念フェア！', 'tag', '563'],
  ['2026年マンガ初め！小学館オールジャンル漫画フェア！第三弾', 'tag', '566'],
  ['月１作家企画・畑亜希美先生特集！', 'tag', '569'],
  ['月１作家企画・藤沢志月先生特集！', 'tag', '572'],
  ['2/22は猫の日！フラコミで猫まみれ', 'tag', '575'],
  ['「ラブファントム」「その男、沼につき」合同PV公開中！', 'tag', '578'],
  ['萩尾望都作品無料増量中！', 'tag', '581'],
];

interface Entry {
  id: number;
  thumbnail?: { src?: string | null } | null;
  name: string;
}
interface Episode {
  chapterType: number;
  id: number;
  subTitle?: string | null;
  title: string;
  updated?: string | null;
}

/** Fetches an RSC payload without its `T<len>,` text rows (their bytes run on into the next row). */
const rsc = async (url: string) => {
  const body = (await http.get(url, { headers: rscHeaders })).body;
  const rows: string[] = [];
  let pos = 0;
  while (pos < body.length) {
    const m = /^[0-9a-f]+:/.exec(body.slice(pos, pos + 16));
    const text = m ? /^T([0-9a-f]+),/.exec(body.slice(pos + m[0].length, pos + m[0].length + 12)) : null;
    if (text) {
      pos += m![0].length + text[0].length + parseInt(text[1]!, 16);
      continue;
    }
    let end = body.indexOf('\n', pos);
    if (end < 0) end = body.length;
    rows.push(body.slice(pos, end));
    pos = end + 1;
  }
  return rows.join('\n');
};

const toManga = (e: Entry): MangaSummary => ({
  url: `/${e.id}`,
  title: e.name,
  thumbnailUrl: e.thumbnail?.src ?? undefined,
});
const isLocked = (e: Episode) => e.chapterType === 4 || e.chapterType === 3 || e.chapterType === 2;

const hexBytes = (hex: string) => {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
};

async function updateDay(day: string): Promise<MangaPage> {
  const data = findRscObject<{ weekdays: Record<string, Entry[]> }>(
    await rsc(`${BASE_URL}/rensai`),
    (o) => 'weekdays' in o,
  );
  return { items: (data?.weekdays?.[day] ?? []).map(toManga), hasNextPage: false };
}

export default defineExtension({
  preferences: () => [{ type: 'switch', key: HIDE_LOCKED, label: 'Hide Locked Chapters', default: false }],
  createSource: () => ({
    baseUrl: BASE_URL,
    imageHeaders: () => headers,
    async getPopular(): Promise<MangaPage> {
      const holder = findRscObject<Record<string, unknown>>(await rsc(`${BASE_URL}/ranking`), (o) =>
        Object.values(o).some(
          (v) => Array.isArray(v) && v.some((b) => b && typeof b === 'object' && 'rankingTypeName' in b),
        ),
      );
      const blocks = Object.values(holder ?? {}).find(
        (v) => Array.isArray(v) && v.some((b) => b && typeof b === 'object' && 'rankingTypeName' in b),
      ) as { rankingTypeName: string; titles: Entry[] }[] | undefined;
      return {
        items: (blocks?.find((b) => b.rankingTypeName === '総合')?.titles ?? []).map(toManga),
        hasNextPage: false,
      };
    },
    getLatest() {
      return updateDay(
        ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(Date.now() + 9 * 3600_000).getUTCDay()]!,
      );
    },
    getFilters(): Filter[] {
      return [
        {
          type: 'select',
          id: 'category',
          label: 'Category',
          options: CATEGORIES.map(([label, type, value]) => ({ value: `${type}|${value}`, label })),
        },
      ];
    },
    async search(query: string, _page: number, filters: FilterState): Promise<MangaPage> {
      let url: string;
      if (query.trim()) url = `${BASE_URL}/search?keyword=${encodeURIComponent(query)}`;
      else {
        const [type, value] = (typeof filters.category === 'string' ? filters.category : 'day|mon').split('|') as [
          string,
          string,
        ];
        if (type === 'day') return updateDay(value);
        url = type === 'rensai' ? `${BASE_URL}/rensai/${value}` : `${BASE_URL}/tag/${value}/${type}`;
      }
      const res = await http.get(url, { headers });
      const doc = html.load(res.body, { baseUrl: res.url });
      const items: MangaSummary[] = [];
      for (const a of doc.select('div.grid > a[href^=/title/]')) {
        const title = a.selectFirst('p.text-black')?.text().trim();
        if (!title) continue;
        items.push({
          url: `/${(a.absUrl('href') ?? '').split('/').filter(Boolean).pop()}`,
          title,
          thumbnailUrl: a.selectFirst('img')?.absUrl('src'),
        });
      }
      return { items, hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const res = await http.get(`${BASE_URL}/title${manga.url}`, { headers });
      const doc = html.load(res.body, { baseUrl: res.url });
      const statusText = doc
        .select('div.bg-main-blue p')
        .map((p) => p.text())
        .join(' ');
      return {
        url: manga.url,
        title: doc.selectFirst('h1')?.text().trim() ?? manga.title,
        author:
          doc
            .select('a[href^=/author/] p')
            .map((p) => p.text().trim())
            .join(', ') || undefined,
        description: doc.selectFirst('div.whitespace-pre-wrap p')?.text().trim(),
        genres: doc.select('ul[aria-label=ジャンルタグ一覧] p').map((p) => p.text().trim()),
        thumbnailUrl: doc.selectFirst('section img.object-cover')?.absUrl('src') ?? manga.thumbnailUrl,
        status: statusText.includes('完結')
          ? 'completed'
          : statusText.includes('更新予定') || statusText.includes('連載')
            ? 'ongoing'
            : 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const hideLocked = prefs.get<boolean>(HIDE_LOCKED) === true;
      const res = await http.get(`${BASE_URL}/title${manga.url}`, { headers });
      const data = findRscObject<{
        earlyChapters: Episode[];
        omittedMiddleChapters: Episode[];
        latestChapters: Episode[];
      }>(res.body, (o) => 'earlyChapters' in o && 'latestChapters' in o);
      const all = [
        ...(data?.earlyChapters ?? []),
        ...(data?.omittedMiddleChapters ?? []),
        ...(data?.latestChapters ?? []),
      ];
      return all
        .filter((e) => !hideLocked || !isLocked(e))
        .map((e) => ({
          url: `/chapter/${e.id}`,
          name: `${isLocked(e) ? '🔒 ' : ''}${e.title}${e.subTitle ?? ''}`,
          uploadedAt: parseDate(e.updated, 'yyyy/MM/dd'),
        }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const body = await rsc(`${BASE_URL}${chapter.url}/viewer`);
      const holder = findRscObject<Record<string, unknown>>(body, (o) =>
        Object.values(o).some(
          (v) =>
            Array.isArray(v) && v.length > 0 && v.every((p) => p && typeof p === 'object' && 'src' in p && 'type' in p),
        ),
      );
      const pages = Object.values(holder ?? {}).find(
        (v) =>
          Array.isArray(v) && v.length > 0 && v.every((p) => p && typeof p === 'object' && 'src' in p && 'type' in p),
      ) as { src: string; crypto?: { key: string; iv: string } | null }[] | undefined;
      if (!pages) throw new Error('Log in via WebView and rent or purchase this chapter to read.');
      return pages
        .filter((p) => p.crypto)
        .map((p, index) => ({ index, imageUrl: `${p.src}#${p.crypto!.key}:${p.crypto!.iv}` }));
    },
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      const fragment = (page.imageUrl ?? '').split('#')[1];
      if (!fragment || !fragment.includes(':')) return {};
      const [key, iv] = fragment.split(':') as [string, string];
      return { bytes: crypto.aesDecrypt(bytes, hexBytes(key), { mode: 'cbc', iv: hexBytes(iv) }) };
    },
    getWebUrl: (item) => `${BASE_URL}${item.url.startsWith('/chapter/') ? item.url : `/title${item.url}`}`,
  }),
});
