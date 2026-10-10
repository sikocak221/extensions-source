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
import { USER_AGENT, hostOf } from './common/utils';

const BASE_URL = 'https://zerosumonline.com';
const API = 'https://api.zerosumonline.com/api/v1';
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

interface Title {
  slug: string;
  name: string;
  altTitle?: string;
  authors?: string;
  description?: string;
  thumbnail?: string;
}

function title(bytes: Uint8Array): Title {
  const f = read(bytes);
  return {
    slug: text(first(f, 2)) ?? '',
    name: text(first(f, 3)) ?? '',
    altTitle: text(first(f, 4)),
    authors: text(first(f, 5)),
    description: text(first(f, 7)),
    thumbnail: text(first(f, 8)),
  };
}

function summary(t: Title): MangaSummary {
  return { url: `/detail/${t.slug}`, title: t.name, thumbnailUrl: t.thumbnail };
}

async function api(path: string, post = false): Promise<Field[]> {
  const url = `${API}${path}`;
  const response = post
    ? await http.post<string>(url, '', { headers, responseType: 'bytes' })
    : await http.get<string>(url, { headers, responseType: 'bytes' });
  return read(base64.decodeBytes(response.body));
}

async function list(path: string): Promise<MangaPage> {
  const fields = await api(path);
  return { items: all(fields, 3).map((b) => summary(title(b))), hasNextPage: false };
}

const SORTS = [
  { label: '更新日が新しい順', value: 'date' },
  { label: '作品名順', value: 'title' },
  { label: '著者名順', value: 'author' },
];

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: () => list('/list?category=series&sort=date'),
    getFilters: (): Filter[] => [{ type: 'select', id: 'sort', label: 'Sort by', options: SORTS, default: 'date' }],
    search(query: string, _page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) return list(`/search?keyword=${encodeURIComponent(query)}`);
      const sort = typeof filters.sort === 'string' ? filters.sort : 'date';
      return list(`/list?category=series&sort=${sort}`);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const fields = await api(`/title?tag=${encodeURIComponent(manga.url.split('/').pop() ?? '')}`);
      const t = title(first(fields, 2) as Uint8Array);
      return {
        ...summary(t),
        author: t.authors,
        description: `${t.description ?? ''}${t.altTitle ? `\n\nAlternative Title: ${t.altTitle}` : ''}`,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const fields = await api(`/title?tag=${encodeURIComponent(manga.url.split('/').pop() ?? '')}`);
      const slug = title(first(fields, 2) as Uint8Array).slug;
      return all(fields, 3).map((b) => {
        const c = read(b);
        const published = first(c, 4);
        return {
          url: `/detail/${slug}/${first(c, 1)}`,
          name: text(first(c, 2)) ?? '',
          uploadedAt: typeof published === 'number' ? published * 1000 : undefined,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const fields = await api(`/viewer?chapter_id=${chapter.url.split('/').pop()}`, true);
      return all(fields, 5)
        .map((b) => text(first(read(b), 1)) ?? '')
        .filter(Boolean)
        .map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const slug = /\/detail\/([^/?#]+)/.exec(url)?.[1];
      return hostOf(url) === hostOf(BASE_URL) && slug ? { url: `/detail/${slug}`, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + ('name' in item ? item.url.slice(0, item.url.lastIndexOf('/')) : item.url),
  }),
});
