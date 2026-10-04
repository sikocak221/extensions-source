import {
  type Chapter,
  type Filter,
  type FilterState,
  type ImageTransform,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type Preference,
  type TileOp,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, parseDate } from './common/utils';
import { imageSize } from './image';
import { sha256 } from './sha256';
import { sha512 } from './sha512';

const BASE_URL = 'https://kmanga.kodansha.com';
const API_URL = 'https://api.kmanga.kodansha.com';
const PAGE_LIMIT = 25;
const GRID = 4;
const CHARSET_EVEN = 'we7ru3ty8i';
const CHARSET_ODD = 'h4xm9bqz1p';
// Logged-out visitors get this birthday, which also passes the age gate.
const BIRTHDAY = '2000-01';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, 'X-Kmanga-Platform': '3' };

const HIDE_LOCKED_PREFERENCE: Preference = {
  type: 'switch',
  key: 'hide_locked',
  label: 'Hide locked chapters',
  default: false,
};

const GENRES: [string, string][] = [
  ['Romance･Romcom', '1'],
  ['Horror･Mystery･Suspense', '2'],
  ['Gag･Comedy･Slice-of-Life', '3'],
  ['SF･Fantasy', '4'],
  ['Sports', '5'],
  ['Drama', '6'],
  ['Outlaws･Underworld･Punks', '7'],
  ['Action･Battle', '8'],
  ['Isekai･Super Powers', '9'],
  ['One-off Books', '10'],
  ['Shojo/josei', '11'],
  ['Yaoi/BL', '12'],
  ['LGBTQ', '13'],
  ['Yuri/GL', '14'],
  ['Anime', '15'],
  ['Award Winner', '16'],
];

interface TitleDto {
  title_id: number;
  title_name: string;
  thumbnail_image_url?: string | null;
  banner_image_url?: string | null;
  thumbnail_rect_image_url?: string | null;
}

interface WebTitle {
  title_name: string;
  author_text?: string | null;
  introduction_text?: string | null;
  next_updated_text?: string | null;
  title_in_japanese?: string | null;
  genre_id_list?: number[] | null;
  episode_id_list: number[];
  thumbnail_image_url?: string | null;
  thumbnail_rect_image_url?: string | null;
  banner_image_url?: string | null;
}

interface Episode {
  episode_id: number;
  episode_name: string;
  start_time?: string | null;
  point: number;
  title_id: number;
  index: number;
  badge: number;
  rental_finish_time?: string | null;
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const bytesOf = (text: string) => new Uint8Array(utf8.encode(text));
const sha256Hex = (text: string) => hex(sha256(bytesOf(text)));
const sha512Hex = (text: string) => hex(sha512(bytesOf(text)));
const hashedParam = (key: string, value: string) => `${sha256Hex(key)}_${sha512Hex(value)}`;

/** The site signs every API call with `X-Kmanga-Hash` over its parameters and the birthday cookie. */
async function api<T>(path: string, params: Record<string, string>, post = false): Promise<T> {
  const expires = String(Math.floor(Date.now() / 1000) + 315_360_000);
  const joined = Object.keys(params)
    .sort()
    .map((k) => hashedParam(k, params[k]!))
    .join(',');
  const hash = sha512Hex(sha256Hex(joined) + hashedParam(BIRTHDAY, expires));
  const signed = {
    ...headers,
    'x-kmanga-client-id': '0',
    'x-kmanga-is-crawler': 'false',
    'X-Kmanga-Hash': hash,
    Cookie: `birthday=${encodeURIComponent(JSON.stringify({ value: BIRTHDAY, expires: Number(expires) }))}`,
  };
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const response = post
    ? await http.request<string>({ url: `${API_URL}${path}`, method: 'POST', headers: signed, body: { form: params } })
    : await http.request<string>({ url: `${API_URL}${path}?${query}`, headers: signed });
  if (response.status === 400)
    throw new Error(
      path.includes('viewer')
        ? 'Log in via WebView and rent or purchase this chapter to read.'
        : 'Open WebView and retry',
    );
  if (response.status !== 200) throw new Error(`HTTP ${response.status} for ${path}`);
  return JSON.parse(response.body) as T;
}

const toSummary = (t: TitleDto): MangaSummary => ({
  url: `/title/${t.title_id}`,
  title: t.title_name,
  thumbnailUrl: t.thumbnail_image_url ?? t.banner_image_url ?? t.thumbnail_rect_image_url ?? undefined,
});

const titleIdOf = (url: string) => url.split('/')[2] ?? '';

const isLocked = (e: Episode) => e.point > 0 && e.badge !== 3 && e.rental_finish_time == null;

function chapterName(e: Episode): { name: string; number: number } {
  const match =
    /(?:chapter|ch|episode|ep|第).?\s*(\d+(?:\.\d+)?)(?:\s*[(（](\d+)[)）])?/i.exec(e.episode_name) ??
    /(\d+(?:\.\d+)?)\s*[(（](\d+)[)）]/.exec(e.episode_name) ??
    /^(\d+(?:\.\d+)?)(?:\s*[(（](\d+)[)）])?/.exec(e.episode_name);
  if (!match) return { name: e.episode_name, number: e.index };
  const [whole, main = '', part] = match;
  if (!part) return { name: e.episode_name, number: Number.parseFloat(main) || e.index };
  const name =
    e.episode_name.slice(0, match.index) +
    whole.replace(/\s*[(（]\d+[)）]/, `.${part}`) +
    e.episode_name.slice(match.index + whole.length);
  return { name, number: Number.parseFloat(main.includes('.') ? main : `${main}.${part}`) || e.index };
}

const xorshift32 = (n: number) => {
  n ^= n << 13;
  n ^= n >>> 17;
  n ^= n << 5;
  return n >>> 0;
};

/** The 4×4 tile order, from the seed string (re-implemented from the site's WASM). */
function tileOrder(seed: string, titleId: number, episodeId: number): number[] {
  const charset = titleId % 2 === 0 ? CHARSET_EVEN : CHARSET_ODD;
  let parsed = 0n;
  for (const ch of seed) {
    const index = charset.indexOf(ch);
    if (index === -1) break;
    parsed = (parsed * 10n + BigInt(index)) & 0xffffffffffffffffn;
  }
  let state = (Number(parsed & 0xffffffffn) ^ ((titleId + episodeId) >>> 0)) >>> 0;
  const pairs: [number, number][] = [];
  for (let i = 0; i < GRID * GRID; i++) {
    state = xorshift32(state);
    pairs.push([state, i]);
  }
  return pairs.sort((a, b) => a[0] - b[0]).map(([, source]) => source);
}

export default defineExtension({
  preferences: () => [HIDE_LOCKED_PREFERENCE],
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(page: number): Promise<MangaPage> {
      const ranking = await api<{ ranking_title_list: { id: number }[] }>('/ranking/all', {
        ranking_id: '12',
        offset: String((page - 1) * PAGE_LIMIT),
        limit: String(PAGE_LIMIT + 1),
      });
      const ids = ranking.ranking_title_list.map((t) => String(t.id));
      if (ids.length === 0) return { items: [], hasNextPage: false };
      const hasNextPage = ids.length > PAGE_LIMIT;
      const { title_list } = await api<{ title_list: TitleDto[] }>('/title/list', {
        title_id_list: (hasNextPage ? ids.slice(0, -1) : ids).join(','),
      });
      return { items: title_list.map(toSummary), hasNextPage };
    },
    async getLatest(): Promise<MangaPage> {
      const result = await api<{
        today_weekday_index: number;
        weekly_list: { title_id_list: number[]; weekday_index: number }[];
        title_list: TitleDto[];
      }>('/title/weekly', {});
      const today = result.weekly_list.find((w) => w.weekday_index === result.today_weekday_index)?.title_id_list ?? [];
      const byId = new Map(result.title_list.map((t) => [t.title_id, t]));
      return { items: today.flatMap((id) => (byId.has(id) ? [toSummary(byId.get(id)!)] : [])), hasNextPage: false };
    },
    async search(query: string, _page: number, filters: FilterState): Promise<MangaPage> {
      const params: Record<string, string> = query.trim()
        ? { keyword: query.trim(), limit: '99999' }
        : { genre_id: typeof filters.genre === 'string' ? filters.genre : '1', limit: '99999' };
      const { title_list } = await api<{ title_list: TitleDto[] }>('/search/title', params);
      return { items: title_list.map(toSummary), hasNextPage: false };
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'NOTE: Search query will ignore genre filter' },
      {
        type: 'select',
        id: 'genre',
        label: 'Genres',
        options: GENRES.map(([l, v]) => ({ label: l, value: v })),
        default: '1',
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const titleId = titleIdOf(manga.url);
      const { web_title: t } = await api<{ web_title: WebTitle }>('/web/title/detail', { title_id: titleId });
      let genres: string[] = [];
      if (t.genre_id_list?.length) {
        const result = await api<{ genre_list?: { genre_name: string }[] | null }>('/genre/list', {
          genre_id_list: t.genre_id_list.join(', '),
        });
        genres = (result.genre_list ?? []).map((g) => g.genre_name);
      }
      return {
        url: `/title/${titleId}`,
        title: t.title_name,
        author: t.author_text || undefined,
        description:
          [
            t.introduction_text,
            t.next_updated_text,
            t.title_in_japanese ? `Japanese Title: ${t.title_in_japanese}` : '',
          ]
            .filter(Boolean)
            .join('\n\n') || undefined,
        thumbnailUrl: t.thumbnail_image_url ?? t.banner_image_url ?? t.thumbnail_rect_image_url ?? manga.thumbnailUrl,
        genres,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { web_title: t } = await api<{ web_title: WebTitle }>('/web/title/detail', {
        title_id: titleIdOf(manga.url),
      });
      if (t.episode_id_list.length === 0) return [];
      const { episode_list } = await api<{ episode_list: Episode[] }>(
        '/episode/list',
        { episode_id_list: t.episode_id_list.join(',') },
        true,
      );
      const hideLocked = prefs.get<boolean>(HIDE_LOCKED_PREFERENCE.key) ?? false;
      return episode_list
        .filter((e) => !hideLocked || !isLocked(e))
        .map((e) => {
          const { name, number } = chapterName(e);
          return {
            url: `/title/${e.title_id}/episode/${e.episode_id}`,
            name: `${isLocked(e) ? '🔒 ' : ''}${name}`,
            number,
            uploadedAt: parseDate(e.start_time, 'yyyy-MM-dd HH:mm:ss'),
          };
        })
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const episodeId = chapter.url.split('/').pop() ?? '';
      const result = await api<{ page_list: string[]; scramble_seed: string; title_id: number; episode_id: number }>(
        '/web/episode/viewer',
        { episode_id: episodeId },
      );
      return result.page_list.map((url, index) => ({
        index,
        imageUrl: `${url}#${result.scramble_seed}:${result.title_id}:${result.episode_id}`,
      }));
    },
    imageHeaders: () => headers,
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      const fragment = (page.imageUrl ?? '').split('#')[1] ?? '';
      const [seed, titleId, episodeId] = fragment.split(':');
      if (!seed || !titleId || !episodeId) return {};
      const size = imageSize(bytes);
      if (!size) return {};
      const [width, height] = size;
      const blockW = Math.floor((Math.floor(width / 8) * 8) / GRID);
      const blockH = Math.floor((Math.floor(height / 8) * 8) / GRID);
      const ops: TileOp[] = tileOrder(seed, Number(titleId), Number(episodeId)).map((source, dest) => ({
        sx: (source % GRID) * blockW,
        sy: Math.floor(source / GRID) * blockH,
        w: blockW,
        h: blockH,
        dx: (dest % GRID) * blockW,
        dy: Math.floor(dest / GRID) * blockH,
      }));
      // The strips right of and below the grid are not scrambled.
      const gridW = blockW * GRID;
      const gridH = blockH * GRID;
      if (width > gridW) ops.push({ sx: gridW, sy: 0, w: width - gridW, h: height, dx: gridW, dy: 0 });
      if (height > gridH) ops.push({ sx: 0, sy: gridH, w: gridW, h: height - gridH, dx: 0, dy: gridH });
      return { tiles: { width, height, ops } };
    },
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/title\/(\d+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/title/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
