import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, htmlToText, relativeUrl } from './common/utils';

const BASE_URL = 'https://nicomanga.com';
const PAYLOAD_KEY = 'NicoMangaX2';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const SORTS = [
  { label: 'Last Update', s: 'last_update', pr: 'all' },
  { label: 'Views', s: 'views', pr: 'popular' },
  { label: 'Post Date', s: 'post', pr: 'new' },
  { label: 'Name', s: 'name', pr: 'az' },
];

interface Payload {
  manga?: {
    n: string;
    c?: string;
    artists?: string;
    other_name?: string;
    description?: string;
    status_text?: string;
    authors_list?: { n: string }[];
    genres_list?: { n: string }[];
  };
  images?: string[];
  chapters_list?: { chapter?: string; n?: string; t?: string; ur?: string }[];
}

const load = async (url: string) => html.load((await http.get(url, { headers })).body, { baseUrl: url });

async function list(url: string): Promise<MangaPage> {
  const doc = await load(url);
  return {
    items: doc.select('.manga-grid .manga-card').map((card) => {
      const title = card.selectFirst('.manga-title');
      const img = card.selectFirst('img.manga-img');
      return {
        url: relativeUrl(title?.absUrl('href') ?? ''),
        title: title?.text() ?? '',
        thumbnailUrl: img?.absUrl('data-src') || img?.absUrl('src') || undefined,
      };
    }),
    hasNextPage: doc.select('.custom-pagination .page-link.next:not(.disabled)').length > 0,
  };
}

/** Each character encodes one byte: (codePoint - 19968) xor key[i % key.length]. */
function decodeXorStream(encoded: string): string {
  const bytes: number[] = new Array(encoded.length);
  for (let i = 0; i < encoded.length; i++)
    bytes[i] = ((encoded.charCodeAt(i) - 19968) ^ PAYLOAD_KEY.charCodeAt(i % PAYLOAD_KEY.length)) & 0xff;
  return utf8.decode(bytes);
}

function jsonObjectEnd(text: string): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
  }
  throw new Error('Malformed encoded site payload');
}

/** The site renders details, chapters and pages inside an obfuscated RSC text stream. */
function decodePayload(body: string): Payload {
  for (const match of body.matchAll(/([0-9a-z]+):T[0-9a-f]+,/g)) {
    const from = match.index! + match[0].length;
    const windowEnd = Math.min(body.length, from + 600);
    let start = from;
    while (start < windowEnd && body.charCodeAt(start) < 0x3000) start++;
    if (start >= windowEnd) continue;
    const end = body.indexOf('</script>', start);
    if (end === -1) continue;
    const decoded = decodeXorStream(body.slice(start, end));
    if (!decoded.trimStart().startsWith('{')) continue;
    try {
      const payload = JSON.parse(decoded.slice(0, jsonObjectEnd(decoded))) as Payload;
      if (payload.manga) return payload;
    } catch {
      // Not the payload: next marker.
    }
  }
  throw new Error('Encoded site payload not found');
}

function parseDate(text: string | undefined): number | undefined {
  const match = /(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/.exec(text?.trim() ?? '');
  if (!match) return undefined;
  const seconds = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2629746, year: 31556952 }[
    match[2] as 'second'
  ];
  return Date.now() - Number(match[1]) * seconds * 1000;
}

async function searchPage(page: number, name: string | undefined, author: string | undefined, filters: FilterState) {
  const params = [`p=${page}`];
  if (name?.trim()) params.push(`n=${encodeURIComponent(name.trim())}`);
  if (author?.trim()) params.push(`a=${encodeURIComponent(author.trim())}`);
  const sort = filters.sort as { value: string; ascending: boolean } | undefined;
  const sortDef = SORTS.find((s) => s.s === sort?.value) ?? SORTS[0]!;
  params.push(`s=${sortDef.s}`, `pr=${sortDef.pr}`, `st=${sort?.ascending ? 'ASC' : 'DESC'}`);
  const genres = Object.entries(filters)
    .filter(([id, v]) => id.startsWith('genre.') && v === true)
    .map(([id]) => id.slice(6));
  if (genres.length) {
    params.push(`g=${genres.join(',')}`);
    params.push(`gm=${filters.logic === 'OR' ? 0 : 1}`);
  }
  return list(`${BASE_URL}/manga-list.html?${params.join('&')}`);
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`${BASE_URL}/manga-list.html?p=${page}&pr=popular`),
    getLatest: (page) => list(`${BASE_URL}/manga-list.html?p=${page}&pr=new`),
    async getFilters(): Promise<Filter[]> {
      const doc = await load(`${BASE_URL}/manga-list.html`);
      const genres: Filter[] = [];
      for (const a of doc.select('a.genre-tag')) {
        const id = /[?&]g=([^&]+)/.exec(a.absUrl('href') ?? '')?.[1];
        if (id && a.text()) genres.push({ type: 'checkbox', id: `genre.${id}`, label: a.text() });
      }
      return [
        { type: 'text', id: 'author', label: 'Author' },
        {
          type: 'sort',
          id: 'sort',
          label: 'Sort',
          options: SORTS.map((s) => ({ label: s.label, value: s.s })),
          default: { value: 'last_update', ascending: false },
        },
        {
          type: 'select',
          id: 'logic',
          label: 'Matching Logic',
          options: [
            { label: 'OR', value: 'OR' },
            { label: 'AND', value: 'AND' },
          ],
          default: 'AND',
        },
        ...(genres.length ? [{ type: 'group', id: 'genres', label: 'Genres', filters: genres } as Filter] : []),
      ];
    },
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const author = typeof filters.author === 'string' ? filters.author.trim() : '';
      // Name and author are separate site parameters; a plain query that finds no title is retried as an author.
      if (query.trim() && !author && page === 1) {
        const byName = await searchPage(page, query, undefined, filters);
        if (byName.items.length) return byName;
        const byAuthor = await searchPage(page, undefined, query, filters);
        return byAuthor.items.length ? byAuthor : byName;
      }
      return searchPage(page, query, author, filters);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const payload = decodePayload((await http.get(BASE_URL + manga.url, { headers })).body);
      const m = payload.manga!;
      const status = (m.status_text ?? '').toLowerCase();
      const parts: string[] = [];
      const desc = m.description?.trim() ? htmlToText(m.description) : '';
      if (desc && desc.toLowerCase() !== 'updating') parts.push(desc);
      if (m.other_name?.trim()) parts.push(m.other_name.trim());
      return {
        url: manga.url,
        title: m.n,
        thumbnailUrl: m.c ?? manga.thumbnailUrl,
        author: m.authors_list?.map((a) => a.n).join(', ') || undefined,
        artist: m.artists || m.authors_list?.[0]?.n,
        genres: m.genres_list?.map((g) => g.n),
        status: (status === 'on going' || status === 'ongoing'
          ? 'ongoing'
          : status === 'completed'
            ? 'completed'
            : 'unknown') as MangaStatus,
        description: parts.join('\n\n'),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const payload = decodePayload((await http.get(BASE_URL + manga.url, { headers })).body);
      return (payload.chapters_list ?? []).map((c) => ({
        url: relativeUrl(c.ur ?? ''),
        name: c.n?.trim() ? c.n : `Chapter ${c.chapter ?? ''}`,
        uploadedAt: parseDate(c.t),
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const payload = decodePayload((await http.get(BASE_URL + chapter.url, { headers })).body);
      return (payload.images ?? []).map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const path = relativeUrl(url.replace(/[?#].*/, ''));
      return hostOf(url) === hostOf(BASE_URL) && /^\/[^/]+\/[^/]+\.html$/.test(path) ? { url: path, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
