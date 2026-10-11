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

const BASE_URL = 'https://ciao.shogakukan.co.jp';
const API_URL = 'https://api.ciao.shogakukan.co.jp';
const PAGE_LIMIT = 25;
const GRID = 4;
const JST = 9 * 3600 * 1000;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

// [label, type, id]
const CATEGORIES: [string, 'ranking' | 'genre', string][] = [
  ['(ランキング) まんが総合', 'ranking', '1'],
  ['(ランキング) 急上昇', 'ranking', '2'],
  ['(ランキング) 読切', 'ranking', '3'],
  ['(ランキング) ラブ', 'ranking', '4'],
  ['(ランキング) ホラー・ミステリー', 'ranking', '5'],
  ['(ランキング) ファンタジー', 'ranking', '6'],
  ['(ランキング) ギャグ・エッセイ', 'ranking', '7'],
  ['ギャグ・エッセイ', 'genre', '1'],
  ['ラブ', 'genre', '2'],
  ['ホラー・ミステリー', 'genre', '3'],
  ['家族', 'genre', '4'],
  ['青春・学園', 'genre', '5'],
  ['友情', 'genre', '6'],
  ['ファンタジー', 'genre', '7'],
  ['ドリーム・サクセス', 'genre', '8'],
  ['異世界', 'genre', '9'],
  ['新人コミック大賞', 'genre', '11'],
];

interface TitleDto {
  title_id: number;
  title_name: string;
  thumbnail_image_url?: string | null;
  episode_free_updated?: string | null;
}

interface WebTitle extends TitleDto {
  author_text?: string | null;
  introduction_text?: string | null;
  genre_id_list?: number[] | null;
  episode_id_list?: number[] | null;
  new_episode_update_cycle_text?: string | null;
}

interface Episode {
  episode_id: number;
  episode_name: string;
  index?: number | null;
  start_time?: string | null;
  title_id: number;
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const bytesOf = (text: string) => new Uint8Array(utf8.encode(text));
const sha256Hex = (text: string) => hex(sha256(bytesOf(text)));
const sha512Hex = (text: string) => hex(sha512(bytesOf(text)));

/** Every API call is signed with `X-Bambi-Hash` over its parameters. */
async function api<T>(path: string, params: Record<string, string>, post = false): Promise<T> {
  const joined = Object.keys(params)
    .sort()
    .map((k) => `${sha256Hex(k)}_${sha512Hex(params[k]!)}`)
    .join(',');
  const signed = { ...headers, 'X-Bambi-Hash': sha512Hex(sha256Hex(joined)) };
  const all = params;
  const query = Object.entries(all)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const response = post
    ? await http.request<string>({ url: `${API_URL}${path}`, method: 'POST', headers: signed, body: { form: all } })
    : await http.request<string>({ url: `${API_URL}${path}?${query}`, headers: signed });
  if (response.status !== 200) throw new Error(`HTTP ${response.status} for ${path}`);
  return JSON.parse(response.body) as T;
}

/** The signature covers the parameters including `platform`. */
const signedApi = <T>(path: string, params: Record<string, string>, post = false) =>
  api<T>(path, { platform: '3', ...params }, post);

const pad = (id: number | string) => String(id).padStart(5, '0');

const toSummary = (t: TitleDto): MangaSummary => ({
  url: `/${pad(t.title_id)}`,
  title: t.title_name,
  thumbnailUrl: t.thumbnail_image_url ?? undefined,
});

async function ranking(rankingId: string, page: number): Promise<MangaPage> {
  const result = await signedApi<{ ranking_title_list: { id: number }[] }>('/ranking/all', {
    ranking_id: rankingId,
    offset: String((page - 1) * PAGE_LIMIT),
    limit: '26',
    is_top: '0',
  });
  const ids = result.ranking_title_list.map((t) => pad(t.id));
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
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page: number) => ranking('1', page),
    async getLatest(): Promise<MangaPage> {
      const result = await signedApi<{ title_list: TitleDto[] }>('/title/weekly', {});
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
      if (query.trim()) {
        const { title_list } = await signedApi<{ title_list: TitleDto[] }>('/search/title', {
          keyword: query.trim(),
          limit: '99999',
        });
        return { items: title_list.map(toSummary), hasNextPage: false };
      }
      const [, type, id] = CATEGORIES[Number(filters.category ?? 0)] ?? CATEGORIES[0]!;
      if (type === 'ranking') return ranking(id, page);
      const { title_list } = await signedApi<{ title_list: TitleDto[] }>('/search/title', {
        genre_id: id,
        limit: '99999',
      });
      return { items: title_list.map(toSummary), hasNextPage: false };
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
        description: [t.introduction_text, t.new_episode_update_cycle_text].filter(Boolean).join('\n\n') || undefined,
        thumbnailUrl: t.thumbnail_image_url ?? manga.thumbnailUrl,
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
      return episode_list
        .map((e) => {
          const original = e.episode_name.trim();
          const start = parseDate(e.start_time, 'yyyy-MM-dd HH:mm:ss');
          return {
            url: `/${pad(e.title_id)}/${e.episode_id}`,
            name: original.startsWith(title) ? `【第${e.index}話】 ${original}` : original,
            number: e.index ?? -1,
            uploadedAt: start === undefined ? undefined : start - JST,
          };
        })
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const result = await signedApi<{ page_list: string[]; scramble_seed: number; scramble_ver?: number | null }>(
        '/web/episode/viewer',
        { episode_id: chapter.url.split('/').pop()! },
      );
      const version = result.scramble_ver === 2 ? 2 : 1;
      return result.page_list.map((url, index) => ({ index, imageUrl: `${url}#${version}:${result.scramble_seed}` }));
    },
    imageHeaders: () => headers,
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      const fragment = (page.imageUrl ?? '').split('#')[1] ?? '';
      const [version, seed] = fragment.split(':');
      if (!version || !seed) return {};
      const size = imageSize(bytes);
      if (!size) return {};
      const [width, height] = size;
      const tile = (n: number) => (version === '2' ? Math.floor(n / 32) * 8 : Math.floor((Math.floor(n / 8) * 8) / 4));
      const tw = tile(width);
      const th = tile(height);
      const ops: TileOp[] = tileOrder(Number(seed)).map((source, dest) => ({
        sx: (source % GRID) * tw,
        sy: Math.floor(source / GRID) * th,
        w: tw,
        h: th,
        dx: (dest % GRID) * tw,
        dy: Math.floor(dest / GRID) * th,
      }));
      const gridW = tw * GRID;
      const gridH = th * GRID;
      if (gridW < width) ops.push({ sx: gridW, sy: 0, w: width - gridW, h: height, dx: gridW, dy: 0 });
      if (gridH < height) ops.push({ sx: 0, sy: gridH, w: gridW, h: height - gridH, dx: 0, dy: gridH });
      return { tiles: { width, height, ops } };
    },
    getWebUrl(item) {
      const [, title, episode] = item.url.split('/');
      return absoluteUrl(BASE_URL, `/comics/title/${title}${episode ? `/episode/${episode}` : ''}`);
    },
  }),
});
