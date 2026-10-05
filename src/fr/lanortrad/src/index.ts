import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, parseDate } from './common/utils';

const BASE_URL = 'https://lanortrad.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface Series {
  id: string;
  title: string;
  type?: string;
  lastUpdate?: string;
  genres?: string[];
  status?: string;
  description?: string;
  cover?: string;
  author?: string;
  artist?: string;
}

// [number, pages, options?]: options carry the folder ("f"), the folder prefix ("p") and the date ("d").
type ChapterEntry = [string, number, { f?: string; p?: string; d?: string }?];
type ChapterIndex = Record<string, { p?: string; c: ChapterEntry[] }>;

const STATUS: Record<string, MangaStatus> = { 'en cours': 'ongoing', terminé: 'completed', 'en pause': 'hiatus' };

const text = async (path: string) => (await http.get(`${BASE_URL}/${path}`, { headers })).body;

/** Keys may share a line with braces or other entries, so they are quoted by scanning outside string literals. */
function quoteUnquotedKeys(input: string): string {
  let out = '';
  let inString = false;
  let i = 0;
  const word = /[\p{L}\p{N}_]/u;
  while (i < input.length) {
    const c = input[i]!;
    if (inString) {
      out += c;
      if (c === '\\' && i + 1 < input.length) {
        out += input[i + 1];
        i += 2;
        continue;
      }
      if (c === '"') inString = false;
      i++;
    } else if (c === '"') {
      inString = true;
      out += c;
      i++;
    } else if (word.test(c)) {
      let j = i;
      while (j < input.length && word.test(input[j]!)) j++;
      let k = j;
      while (k < input.length && /\s/.test(input[k]!)) k++;
      if (input[k] === ':') {
        out += `"${input.substring(i, j)}":`;
        i = k + 1;
      } else {
        out += input.substring(i, j);
        i = j;
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

async function fetchSeries(): Promise<Series[]> {
  const body = (await text('js/data/series.js')).replace(/^\s*\/\/.*$/gm, '');
  const json = body.substring(body.indexOf('window.SERIES =') + 'window.SERIES ='.length);
  // Trailing commas are legal in the source, not in JSON.
  const cleaned = quoteUnquotedKeys(json.substring(0, json.lastIndexOf(';'))).replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(cleaned) as Series[];
}

/** One read: the chapter index and the page map share one response. */
async function fetchChapterData(): Promise<{ index: ChapterIndex; pageFiles: Record<string, string> }> {
  const body = await text('js/data/chapters.js');
  const start = body.indexOf('return expand(') + 'return expand('.length;
  const end = body.lastIndexOf('})();');
  const index = JSON.parse(body.substring(start, end).replace(/\);\s*$/, '')) as ChapterIndex;
  const pages = /window\.CHAPTER_PAGES\s*=\s*(\{[\s\S]*?\});/.exec(body)?.[1];
  return { index, pageFiles: pages ? (JSON.parse(pages) as Record<string, string>) : {} };
}

const seriesId = (url: string) => decodeURIComponent(url.replace(/^\//, '').split('/')[0] ?? '');

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Mn}+/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

const toSummary = (s: Series): MangaSummary => ({
  url: `/${s.id}`,
  title: s.title,
  thumbnailUrl: s.cover
    ? s.cover.startsWith('http')
      ? s.cover
      : `${BASE_URL}/${s.cover.replace(/^\//, '')}`
    : undefined,
});

function folderOf(entries: ChapterEntry[], defaultPrefix: string, num: string): string | undefined {
  const entry = entries.find((e) => e[0] === num);
  if (!entry) return undefined;
  const opts = entry[2];
  return opts?.f ?? (opts?.p ?? defaultPrefix) + num;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      return { items: (await fetchSeries()).map(toSummary), hasNextPage: false };
    },
    async getLatest(): Promise<MangaPage> {
      const series = (await fetchSeries()).sort((a, b) => (b.lastUpdate ?? '').localeCompare(a.lastUpdate ?? ''));
      return { items: series.map(toSummary), hasNextPage: false };
    },
    async search(query): Promise<MangaPage> {
      const needle = query.trim().toLowerCase();
      const series = (await fetchSeries()).filter((s) => !needle || s.title.toLowerCase().includes(needle));
      return { items: series.map(toSummary), hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const id = seriesId(manga.url);
      const s = (await fetchSeries()).find((x) => x.id === id);
      if (!s) throw new Error('Manga not found');
      return {
        ...toSummary(s),
        author: s.author || undefined,
        artist: s.artist || undefined,
        description: s.description || undefined,
        genres: (s.genres ?? []).filter((g) => g !== 'Collaboration'),
        status: STATUS[(s.status ?? '').toLowerCase()] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const id = seriesId(manga.url);
      // The series type drives the oneshot collapsing.
      const [series, data] = await Promise.all([fetchSeries(), fetchChapterData()]);
      const entries = data.index[id]?.c ?? [];
      const seen = new Set<string>();
      const chapters = entries
        .filter((e) => !seen.has(e[0]) && seen.add(e[0]))
        .map((e): Chapter => {
          const number = Number.parseFloat(e[0]);
          return {
            url: `/${id}/${e[0]}`,
            name: `Chapitre ${e[0]}`,
            number: Number.isNaN(number) ? -1 : number,
            uploadedAt: e[2]?.d ? parseDate(e[2].d, 'yyyy-MM-dd') : undefined,
          };
        })
        .sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
      if (series.find((s) => s.id === id)?.type?.toLowerCase() === 'oneshot') {
        const oneshot = chapters[0];
        return oneshot ? [{ ...oneshot, name: 'Oneshot' }] : [];
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const parts = chapter.url.replace(/^\//, '').split('/');
      const id = decodeURIComponent(parts[0] ?? '');
      const num = parts[1] ?? '';
      const data = await fetchChapterData();
      const pagesPath = data.pageFiles[id];
      const node = data.index[id];
      if (!pagesPath || !node) return [];
      const folder = folderOf(node.c, node.p ?? '', num);
      if (!folder) return [];
      const file = await text(pagesPath);
      const pagesFile = JSON.parse(file.substring(file.lastIndexOf('=') + 1, file.lastIndexOf(';'))) as Record<
        string,
        { f?: string[] }
      >;
      const prefix = [id, ...folder.split('/')].map(encodeURIComponent).join('/');
      return (pagesFile[num]?.f ?? []).map((name, index) => ({
        index,
        imageUrl: `${BASE_URL}/Manga/${prefix}/${encodeURIComponent(name)}`,
      }));
    },
    imageHeaders: () => headers,
    getWebUrl(item): string {
      const parts = item.url.replace(/^\//, '').split('/');
      const slug = slugify(decodeURIComponent(parts[0] ?? ''));
      if (parts.length < 2)
        return `${BASE_URL}/manga.html?id=${encodeURIComponent(decodeURIComponent(parts[0] ?? ''))}`;
      return 'name' in item && item.name === 'Oneshot'
        ? `${BASE_URL}/manga/${slug}/lecture/`
        : `${BASE_URL}/manga/${slug}/chapitre-${parts[1]}/`;
    },
    // Pasted /manga/<slug>/ links cannot be mapped to a series id without the catalog: only manga.html?id= links
    // (which are also the web urls given out).
    resolveUrl(url): MangaSummary | null {
      const id = /^https?:\/\/(?:www\.)?lanortrad\.com\/manga\.html\?(?:.*&)?id=([^&#]+)/i.exec(url)?.[1];
      return id ? { url: `/${decodeURIComponent(id)}`, title: '' } : null;
    },
  }),
});
