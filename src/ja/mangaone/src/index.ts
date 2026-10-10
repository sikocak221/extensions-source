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
import { USER_AGENT, hostOf, htmlToText, parseDate } from './common/utils';

const BASE_URL = 'https://manga-one.com';
const API = `${BASE_URL}/api/client`;
const HIDE_LOCKED = 'hide_locked';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

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


async function proto(query: string, post = false): Promise<Field[]> {
  const url = `${API}?${query}`;
  const response = post
    ? await http.post<string>(url, '', { headers, responseType: 'bytes' })
    : await http.get<string>(url, { headers, responseType: 'bytes' });
  return read(base64.decodeBytes(response.body));
}

function entry(bytes: Uint8Array, coverField: number, fallback?: number): MangaSummary {
  const f = read(bytes);
  return {
    url: `/title/${first(f, 1)}`,
    title: text(first(f, 2)) ?? '',
    thumbnailUrl: text(first(f, coverField)) || (fallback ? text(first(f, fallback)) : undefined),
  };
}

/** ResponseList { 3: [ { 1: Titles { 1: Entry } } ] } */
function responseList(fields: Field[]): MangaSummary[] {
  return all(fields, 3).map((w) => {
    const titles = first(read(w), 1) as Uint8Array;
    const e = first(read(titles), 1) as Uint8Array;
    return entry(e, 16, 6);
  });
}

const idOf = (url: string) => /(\d+)\/?$/.exec(url)?.[1] ?? url;
const hex = (value: string) => Uint8Array.from(value.match(/../g) ?? [], (h) => Number.parseInt(h, 16));

export default defineExtension({
  preferences: () => [{ type: 'switch', key: HIDE_LOCKED, label: 'Hide Locked Chapters', default: false }],
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const fields = await proto('rq=ranking');
      const lists = all(fields, 1).flatMap((category) => all(read(category), 3));
      for (const list of lists) {
        const l = read(list);
        if (text(first(l, 2)) !== 'すべて') continue;
        const items = all(l, 3).map((t) => entry(first(read(t), 1) as Uint8Array, 6));
        return { items, hasNextPage: false };
      }
      return { items: [], hasNextPage: false };
    },
    async getLatest(): Promise<MangaPage> {
      const fields = await proto('rq=rensai');
      const dayIndex = (new Date(Date.now() + 9 * 3_600_000).getUTCDay() + 6) % 7;
      const day = all(fields, 1)[dayIndex];
      return { items: day ? responseList(read(day)) : [], hasNextPage: false };
    },
    async getFilters(): Promise<Filter[]> {
      const fields = await proto('rq=title/search');
      const tags = all(fields, 2).map((b) => {
        const t = read(b);
        return { label: text(first(t, 2)) ?? '', value: String(first(t, 1)) };
      });
      return tags.length ? [{ type: 'select', id: 'tag', label: 'ジャンル', options: tags, default: tags[0]!.value }] : [];
    },
    async search(query: string, _page: number, filters: FilterState): Promise<MangaPage> {
      const tag = typeof filters.tag === 'string' ? filters.tag : '';
      const q = query.trim() ? `&query=${encodeURIComponent(query)}` : tag ? `&tag_id=${tag}` : '';
      const fields = await proto(`rq=title/search${q}`, true);
      return { items: responseList(fields), hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const fields = await proto(`rq=viewer_v2&title_id=${idOf(manga.url)}`, true);
      const d = read(first(read(first(fields, 5) as Uint8Array), 1) as Uint8Array);
      const thumb = d.find((f) => f.n === 22)?.v;
      return {
        url: manga.url,
        title: text(first(d, 2)) ?? manga.title,
        author: text(first(d, 5)),
        description: htmlToText(text(first(d, 4)) ?? ''),
        thumbnailUrl: (thumb instanceof Uint8Array ? text(first(read(thumb), 3)) : undefined) ?? manga.thumbnailUrl,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const hide = prefs.get<boolean>(HIDE_LOCKED) === true;
      const fields = await proto(
        `rq=viewer/chapter_list&title_id=${idOf(manga.url)}&page=1&limit=9999&sort_type=desc&type=chapter`,
      );
      const chapters: Chapter[] = [];
      for (const raw of all(read(first(fields, 1) as Uint8Array), 1)) {
        const c = read(raw);
        const points = c.find((f) => f.n === 16)?.v;
        const locked =
          points instanceof Uint8Array && read(points).some((f) => [1, 2, 3].includes(f.n) && typeof f.v === 'number');
        if (hide && locked) continue;
        const title = text(first(c, 2)) ?? '';
        const sub = text(first(c, 3));
        chapters.push({
          url: `${idOf(manga.url)}/${first(c, 1)}`,
          name: (locked ? '🔒 ' : '') + (sub ? `${title} - ${sub}` : title),
          uploadedAt: parseDate(text(first(c, 5)), 'yyyy/MM/dd'),
        });
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [titleId, chapterId] = chapter.url.split('/');
      const fields = await proto(`rq=viewer_v2&title_id=${titleId}&chapter_id=${chapterId}`, true);
      const pages = all(fields, 1);
      if (!pages.length) throw new Error('Log in via WebView and rent or purchase this chapter to read.');
      const key = text(first(fields, 3));
      const iv = text(first(fields, 4));
      const out: Page[] = [];
      for (const p of pages) {
        const image = first(read(p), 1);
        if (!(image instanceof Uint8Array)) continue;
        out.push({ index: out.length, imageUrl: `${text(first(read(image), 1))}#${key}:${iv}` });
      }
      return out;
    },
    imageHeaders: () => headers,
    /** AES-CBC (key and iv as hex in the fragment). */
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      const match = /#([0-9a-fA-F]+):([0-9a-fA-F]+)$/.exec(page.imageUrl ?? '');
      if (!match) return {};
      return { bytes: crypto.aesDecrypt(bytes, hex(match[1]!), { mode: 'cbc', iv: hex(match[2]!) }) };
    },
    resolveUrl(url: string): MangaSummary | null {
      const id = /\/title\/(\d+)/.exec(url)?.[1];
      return hostOf(url) === hostOf(BASE_URL) && id ? { url: `/title/${id}`, title: '' } : null;
    },
    getWebUrl(item): string {
      if ('name' in item) {
        const [titleId, chapterId] = item.url.split('/');
        return `${BASE_URL}/manga/${titleId}/chapter/${chapterId}`;
      }
      return BASE_URL + item.url;
    },
  }),
});
