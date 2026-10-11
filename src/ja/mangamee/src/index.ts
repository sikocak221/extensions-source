import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type ImageTransform,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, findRscObject, hostOf } from './common/utils';

const BASE_URL = 'https://manga-mee.jp';
const API = 'https://prod2-android.manga-mee.jp/web/v1';
const HIDE_LOCKED = 'hide_locked';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const rscHeaders = { ...headers, rsc: '1' };

// --- minimal protobuf reader (varint, length-delimited; other wire types skipped) ---
type Field = { n: number; v: number | Uint8Array };

function read(bytes: Uint8Array): Field[] {
  const fields: Field[] = [];
  let i = 0;
  const varint = (): number => {
    let result = 0;
    let shift = 0;
    for (;;) {
      const b = bytes[i++]!;
      result += (b & 0x7f) * 2 ** shift;
      if (!(b & 0x80)) return result;
      shift += 7;
    }
  };
  while (i < bytes.length) {
    const tag = varint();
    const n = Math.floor(tag / 8);
    const wire = tag & 7;
    if (wire === 0) fields.push({ n, v: varint() });
    else if (wire === 2) {
      const len = varint();
      fields.push({ n, v: bytes.subarray(i, i + len) });
      i += len;
    } else if (wire === 1) i += 8;
    else if (wire === 5) i += 4;
    else throw new Error(`Unsupported protobuf wire type ${wire}`);
  }
  return fields;
}

const text = (v: number | Uint8Array | undefined): string | undefined =>
  v instanceof Uint8Array ? utf8.decode(Array.from(v)) : undefined;
const first = (fields: Field[], n: number) => fields.find((f) => f.n === n)?.v;
const all = (fields: Field[], n: number) => fields.filter((f) => f.n === n).map((f) => f.v as Uint8Array);
interface TitleDto {
  id: number;
  name: string;
  largeImage?: { src?: string | null } | null;
}

const summary = (t: TitleDto): MangaSummary => ({
  url: `/detail/${t.id}`,
  title: t.name,
  thumbnailUrl: t.largeImage?.src ?? undefined,
});

const idOf = (url: string) => /(\d+)\/?$/.exec(url)?.[1] ?? url;

async function rsc(path: string): Promise<string> {
  return (await http.get(BASE_URL + path, { headers: rscHeaders })).body;
}

async function detail(query: string): Promise<Field[]> {
  const response = await http.get<string>(`${API}/title_detail?${query}`, { headers, responseType: 'bytes' });
  return read(base64.decodeBytes(response.body));
}

export default defineExtension({
  preferences: () => [{ type: 'switch', key: HIDE_LOCKED, label: 'Hide Locked Chapters', default: false }],
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const body = await rsc('/title-list/ranking');
      const ranking = findRscObject<{ rankingList: { name?: string; titles: TitleDto[] }[] }>(body, (v) =>
        Array.isArray(v.rankingList),
      );
      const list = ranking?.rankingList.find((r) => r.name === '総合')?.titles ?? [];
      return { items: list.map(summary), hasNextPage: false };
    },
    async getLatest(): Promise<MangaPage> {
      const body = await rsc('/title-list/todaysupdate');
      const group = findRscObject<{ titleGroup: { titles: TitleDto[] } }>(body, (v) => 'titleGroup' in v);
      return { items: (group?.titleGroup.titles ?? []).map(summary), hasNextPage: false };
    },
    async search(query: string): Promise<MangaPage> {
      const body = await rsc(`/search-result/keyword/${encodeURIComponent(query)}`);
      const result = findRscObject<{ popularTitles: { titles: TitleDto[] } }>(body, (v) => 'popularTitles' in v);
      return { items: (result?.popularTitles.titles ?? []).map(summary), hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const fields = await detail(`title_id=${idOf(manga.url)}`);
      const t = read(first(fields, 1) as Uint8Array);
      const kana = text(first(t, 17));
      return {
        url: manga.url,
        title: text(first(t, 2)) ?? manga.title,
        author: text(first(t, 6)),
        description: `${text(first(t, 4)) ?? ''}${kana ? `\n\nAlternative Title: ${kana}` : ''}`,
        thumbnailUrl: text(first(t, 9)) ?? manga.thumbnailUrl,
        genres: all(fields, 3)
          .map((b) => text(first(read(b), 2)) ?? '')
          .filter(Boolean),
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const hide = prefs.get<boolean>(HIDE_LOCKED) === true;
      const body = await rsc(`/all-episodes/${idOf(manga.url)}`);
      const eps = findRscObject<{
        allEpisodes: { episodes: { id: number; title: string; isFree?: boolean | null }[] };
      }>(body, (v) => 'allEpisodes' in v);
      return (eps?.allEpisodes.episodes ?? [])
        .filter((e) => !hide || e.isFree !== false)
        .map((e) => ({ url: `${idOf(manga.url)}/${e.id}`, name: (e.isFree === false ? '🔒 ' : '') + e.title }))
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [titleId, episodeId] = chapter.url.split('/');
      const fields = await detail(`title_id=${titleId}&episode_id=${episodeId}`);
      const pages = all(fields, 13);
      if (!pages.length) throw new Error('This chapter is only accessible via the official マンガMee app.');
      const out: Page[] = [];
      for (const p of pages) {
        const viewer = first(read(p), 1);
        if (!(viewer instanceof Uint8Array)) continue;
        const v = read(viewer);
        out.push({ index: out.length, imageUrl: `${text(first(v, 2))}#key=${text(first(v, 7))}` });
      }
      return out;
    },
    imageHeaders: () => headers,
    /** The image bytes are XOR-ed with the hex key from the url fragment. */
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      const hex = /#key=([0-9a-fA-F]+)/.exec(page.imageUrl ?? '')?.[1];
      if (!hex) return {};
      const key = Uint8Array.from(hex.match(/../g) ?? [], (h) => Number.parseInt(h, 16));
      if (!key.length) return {};
      const out = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) out[i] = bytes[i]! ^ key[i % key.length]!;
      return { bytes: out };
    },
    resolveUrl(url: string): MangaSummary | null {
      const id = /\/detail\/(\d+)/.exec(url)?.[1];
      return hostOf(url) === hostOf(BASE_URL) && id ? { url: `/detail/${id}`, title: '' } : null;
    },
    getWebUrl(item): string {
      if ('name' in item) {
        const [titleId, episodeId] = item.url.split('/');
        return `${BASE_URL}/detail/${titleId}?episodeId=${episodeId}`;
      }
      return BASE_URL + item.url;
    },
  }),
});
