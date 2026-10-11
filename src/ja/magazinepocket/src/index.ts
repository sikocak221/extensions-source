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
import { USER_AGENT, absoluteUrl, parseDate } from './common/utils';
import { imageSize } from './image';
import { sha256 } from './sha256';
import { sha512 } from './sha512';

const BASE_URL = 'https://pocket.shonenmagazine.com';
const API_URL = 'https://api.pocket.shonenmagazine.com';
const PAGE_LIMIT = 25;
const GRID = 4;
const CHARSET_EVEN = 'svdk0m7acl';
const CHARSET_ODD = 'q6jtf2xnog';
const JST = 9 * 3600 * 1000;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, 'X-Manga-Platform': '3' };

// [label, type, id]
const CATEGORIES: [string, 'ranking' | 'genre', string][] = [
  ['(ランキング) すべて', 'ranking', '30'],
  ['(ランキング) まずはコレ！', 'ranking', '2'],
  ['(ランキング) オリジナル', 'ranking', '1'],
  ['(ランキング) 新作', 'ranking', '31'],
  ['(ランキング) アクション', 'ranking', '21'],
  ['(ランキング) スポーツ', 'ranking', '22'],
  ['(ランキング) 恋愛', 'ranking', '23'],
  ['(ランキング) 異世界', 'ranking', '24'],
  ['(ランキング) サスペンス', 'ranking', '25'],
  ['(ランキング) 裏社会・ヤンキー', 'ranking', '26'],
  ['(ランキング) ドラマ', 'ranking', '27'],
  ['(ランキング) ファンタジー', 'ranking', '28'],
  ['(ランキング) 日常', 'ranking', '29'],
  ['恋愛・ラブコメ', 'genre', '1'],
  ['ホラー・ミステリー・サスペンス', 'genre', '2'],
  ['ギャグ・コメディー・日常', 'genre', '3'],
  ['SF・ファンタジー', 'genre', '4'],
  ['スポーツ', 'genre', '5'],
  ['ヒューマンドラマ', 'genre', '6'],
  ['裏社会・アングラ・ヤンキー', 'genre', '7'],
  ['アクション・バトル', 'genre', '8'],
  ['異世界・異能力', 'genre', '9'],
  ['読切', 'genre', '10'],
  ['MGP', 'genre', '11'],
  ['第98回新人漫画賞', 'genre', '12'],
  ['第99回新人漫画賞', 'genre', '13'],
  ['第100回新人漫画賞', 'genre', '14'],
  ['第101回新人漫画賞', 'genre', '15'],
  ['第102回新人漫画賞', 'genre', '16'],
  ['第103回新人漫画賞', 'genre', '17'],
  ['第104回新人漫画賞', 'genre', '18'],
  ['第105回新人漫画賞', 'genre', '19'],
  ['第106回新人漫画賞', 'genre', '20'],
  ['第107回新人漫画賞', 'genre', '21'],
  ['第108回新人漫画賞', 'genre', '22'],
  ['第109回新人漫画賞', 'genre', '23'],
  ['第110回新人漫画賞', 'genre', '24'],
  ['2023真夏の読み切り15連弾', 'genre', '25'],
  ['マガジンライズ', 'genre', '26'],
  ['第111回新人漫画賞', 'genre', '27'],
  ['少女／女性', 'genre', '28'],
  ['新人漫画大賞', 'genre', '29'],
  ['第75回新人漫画賞', 'genre', '30'],
  ['第79回新人漫画賞', 'genre', '31'],
  ['第85回新人漫画賞', 'genre', '32'],
  ['第88回新人漫画賞', 'genre', '33'],
  ['第89回新人漫画賞', 'genre', '34'],
  ['第91回新人漫画賞', 'genre', '35'],
  ['第92回新人漫画賞', 'genre', '36'],
  ['第94回新人漫画賞', 'genre', '37'],
  ['第95回新人漫画賞', 'genre', '38'],
  ['第96回新人漫画賞', 'genre', '39'],
  ['第97回新人漫画賞', 'genre', '40'],
  ['第112回新人漫画賞', 'genre', '41'],
  ['第113回新人漫画大賞', 'genre', '42'],
  ['サッカー', 'genre', '43'],
  ['テニス', 'genre', '44'],
  ['バスケ', 'genre', '45'],
  ['格闘技', 'genre', '46'],
  ['野球', 'genre', '47'],
  ['女性向け異世界', 'genre', '48'],
  ['アニメ化', 'genre', '49'],
  ['実写化', 'genre', '50'],
  ['車・バイク', 'genre', '51'],
  ['グルメ・料理', 'genre', '52'],
  ['医療', 'genre', '53'],
  ['頭脳戦', 'genre', '54'],
  ['サバイバル', 'genre', '55'],
  ['復讐劇', 'genre', '56'],
  ['70～80年代', 'genre', '57'],
  ['90年代', 'genre', '58'],
  ['金田一シリーズ', 'genre', '59'],
  ['第114回新人漫画大賞', 'genre', '60'],
  ['連載獲得ダービー', 'genre', '61'],
  ['有名漫画賞', 'genre', '62'],
  ['探偵・警察', 'genre', '63'],
  ['歴史・時代', 'genre', '64'],
  ['不倫・浮気', 'genre', '65'],
  ['犬・猫', 'genre', '66'],
];

interface TitleDto {
  title_id: number;
  title_name: string;
  thumbnail_image_url?: string | null;
  banner_image_url?: string | null;
  thumbnail_rect_image_url?: string | null;
  episode_free_updated?: string | null;
}

interface WebTitle extends TitleDto {
  author_text?: string | null;
  introduction_text?: string | null;
  genre_id_list?: number[] | null;
  episode_id_list?: number[] | null;
}

interface Episode {
  episode_id: number;
  episode_name: string;
  index?: number | null;
  start_time?: string | null;
  title_id: number;
  point?: number | null;
  badge?: number | null;
  rental_finish_time?: string | null;
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const bytesOf = (text: string) => new Uint8Array(utf8.encode(text));
const sha256Hex = (text: string) => hex(sha256(bytesOf(text)));
const sha512Hex = (text: string) => hex(sha512(bytesOf(text)));
const hashedParam = (key: string, value: string) => `${sha256Hex(key)}_${sha512Hex(value)}`;

/** Every API call is signed with `X-Manga-Hash` over its parameters. */
async function api<T>(path: string, params: Record<string, string>, post = false): Promise<T> {
  const joined = Object.keys(params)
    .sort()
    .map((k) => hashedParam(k, params[k]!))
    .join(',');
  const signed = { ...headers, 'X-Manga-Hash': sha512Hex(`${sha256Hex(joined)}${hashedParam('', '')}`) };
  const all = params;
  const query = Object.entries(all)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const response = post
    ? await http.request<string>({ url: `${API_URL}${path}`, method: 'POST', headers: signed, body: { form: all } })
    : await http.request<string>({ url: `${API_URL}${path}?${query}`, headers: signed });
  if (response.status === 400 && path.includes('viewer'))
    throw new Error('Log in via WebView and rent or purchase this chapter to read.');
  if (response.status !== 200) throw new Error(`HTTP ${response.status} for ${path}`);
  return JSON.parse(response.body) as T;
}

const signedApi = api;

const pad = (id: number | string) => String(id).padStart(5, '0');

const toSummary = (t: TitleDto): MangaSummary => ({
  url: `/${pad(t.title_id)}`,
  title: t.title_name,
  thumbnailUrl: t.thumbnail_image_url ?? t.banner_image_url ?? t.thumbnail_rect_image_url ?? undefined,
});

async function ranking(rankingId: string, page: number): Promise<MangaPage> {
  const result = await signedApi<{
    ranking_title_list?: { id?: number; title_id?: number }[];
    title_list?: { id?: number; title_id?: number }[];
  }>('/ranking/all', { ranking_id: rankingId, offset: String((page - 1) * PAGE_LIMIT), limit: '26' });
  const ids = (result.ranking_title_list ?? result.title_list ?? []).map((t) => pad((t.id ?? t.title_id)!));
  if (ids.length === 0) return { items: [], hasNextPage: false };
  const { title_list } = await signedApi<{ title_list: TitleDto[] }>('/title/list', {
    title_id_list: ids.slice(0, PAGE_LIMIT).join(','),
  });
  return { items: title_list.map(toSummary), hasNextPage: ids.length > PAGE_LIMIT };
}

const xorshift32 = (n: number) => {
  n ^= n << 13;
  n ^= n >>> 17;
  n ^= n << 5;
  return n >>> 0;
};

/** Source tile index for each destination tile. */
function tileOrder(seed: number): number[] {
  let state = seed >>> 0;
  const pairs: [number, number][] = [];
  for (let i = 0; i < GRID * GRID; i++) {
    state = xorshift32(state);
    pairs.push([state, i]);
  }
  return pairs.sort((a, b) => a[0] - b[0]).map(([, source]) => source);
}

export default defineExtension({
  preferences: () => [{ type: 'switch', key: 'hide_locked', label: 'Hide Locked Chapters', default: false }],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page: number) => ranking('30', page),
    async getLatest(): Promise<MangaPage> {
      const result = await signedApi<{ title_list: TitleDto[] }>('/web/title/weekly', {});
      const items = [...result.title_list].sort((a, b) =>
        (b.episode_free_updated ?? '').localeCompare(a.episode_free_updated ?? ''),
      );
      return { items: items.map(toSummary), hasNextPage: false };
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'category',
        label: 'Filter by',
        options: CATEGORIES.map(([label], i) => ({ label, value: String(i) })),
        default: '0',
      },
    ],
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const found = async (path: string, params: Record<string, string>): Promise<MangaPage> => {
        const r = await signedApi<{ title_list?: TitleDto[]; search_title_list?: TitleDto[] }>(path, params);
        return { items: (r.title_list ?? r.search_title_list ?? []).map(toSummary).reverse(), hasNextPage: false };
      };
      if (query.trim()) return found('/web/search/title', { keyword: query.trim(), limit: '99999' });
      const [, type, id] = CATEGORIES[Number(filters.category ?? 0)] ?? CATEGORIES[0]!;
      if (type === 'ranking') return ranking(id, page);
      return found('/search/title', { genre_id: id, limit: '99999' });
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const titleId = manga.url.split('/')[1]!;
      const { title_list } = await signedApi<{ title_list: WebTitle[] }>('/title/list', { title_id_list: titleId });
      const t = title_list[0]!;
      let genres: string[] = [];
      if (t.genre_id_list?.length) {
        const result = await signedApi<{ genre_list?: { genre_name: string }[] | null }>('/genre/list', {
          genre_id_list: t.genre_id_list.join(','),
        });
        genres = (result.genre_list ?? []).map((g) => g.genre_name);
      }
      return {
        url: `/${pad(t.title_id)}`,
        title: t.title_name,
        author: t.author_text || undefined,
        description: t.introduction_text || undefined,
        thumbnailUrl: t.thumbnail_image_url ?? t.banner_image_url ?? t.thumbnail_rect_image_url ?? manga.thumbnailUrl,
        genres,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const titleId = manga.url.split('/')[1]!;
      const { title_list } = await signedApi<{ title_list: WebTitle[] }>('/title/list', { title_id_list: titleId });
      const t = title_list[0]!;
      if (!t.episode_id_list?.length) return [];
      const { episode_list } = await signedApi<{ episode_list: Episode[] }>(
        '/episode/list',
        { episode_id_list: t.episode_id_list.join(',') },
        true,
      );
      const title = t.title_name.trim();
      const hideLocked = prefs.get<boolean>('hide_locked') === true;
      return episode_list
        .filter((e) => !hideLocked || !((e.point ?? 0) > 0 && e.badge !== 3 && !e.rental_finish_time))
        .map((e) => {
          const original = e.episode_name.trim();
          const start = parseDate(e.start_time, 'yyyy-MM-dd HH:mm:ss');
          return {
            url: `/${pad(e.title_id)}/${e.episode_id}`,
            name: `${(e.point ?? 0) > 0 && e.badge !== 3 && !e.rental_finish_time ? '🔒 ' : ''}${original}`,
            number: e.index ?? -1,
            uploadedAt: start === undefined ? undefined : start - JST,
          };
        })
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const result = await signedApi<{
        page_list: string[];
        scramble_seed: string;
        title_id: number;
        episode_id: number;
      }>('/web/episode/viewer', { episode_id: chapter.url.split('/').pop()! });
      return result.page_list.map((url, index) => ({
        index,
        imageUrl: `${url}#${result.scramble_seed}:${result.title_id}:${result.episode_id}`,
      }));
    },
    imageHeaders: () => headers,
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      const fragment = (page.imageUrl ?? '').split('#')[1] ?? '';
      const [seedText, titleText, episodeText] = fragment.split(':');
      if (!seedText || !titleText || !episodeText) return {};
      const size = imageSize(bytes);
      if (!size) return {};
      const [width, height] = size;
      const titleId = Number(titleText);
      const episodeId = Number(episodeText);
      const charset = titleId % 2 === 0 ? CHARSET_EVEN : CHARSET_ODD;
      let parsed = 0n;
      for (const c of seedText) {
        const index = charset.indexOf(c);
        if (index === -1) break;
        parsed = parsed * 10n + BigInt(index);
      }
      const seed = (Number(parsed & 0xffffffffn) ^ ((titleId + episodeId) >>> 0)) >>> 0;
      const bw = Math.floor(width / (GRID * 8)) * 8;
      const bh = Math.floor(height / (GRID * 8)) * 8;
      const ops: TileOp[] = tileOrder(seed).map((source, dest) => ({
        sx: (source % GRID) * bw,
        sy: Math.floor(source / GRID) * bh,
        w: bw,
        h: bh,
        dx: (dest % GRID) * bw,
        dy: Math.floor(dest / GRID) * bh,
      }));
      const pw = bw * GRID;
      const ph = bh * GRID;
      if (width > pw) ops.push({ sx: pw, sy: 0, w: width - pw, h: height, dx: pw, dy: 0 });
      if (height > ph) ops.push({ sx: 0, sy: ph, w: pw, h: height - ph, dx: 0, dy: ph });
      return { tiles: { width, height, ops } };
    },
    getWebUrl(item) {
      const [, title, episode] = item.url.split('/');
      return absoluteUrl(BASE_URL, `/title/${title}${episode ? `/episode/${episode}` : ''}`);
    },
  }),
});
