import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl } from './common/utils';
import { toTraditional } from './s2t';

const BASE_URL = 'https://www.8comic.com';
const CHAPTERS_URL = 'https://articles.onemoreplace.tw';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function cards(document: HtmlElement, selector: string): MangaPage {
  const items = document.select(selector).flatMap((a): MangaSummary[] => {
    const title = a.selectFirst('li.nowraphide')?.text();
    if (!title) return [];
    return [
      {
        url: relativeUrl(a.absUrl('href') ?? ''),
        title,
        thumbnailUrl: a.selectFirst('img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('div.pager a span.mdi-skip-next') !== null };
}

async function search(query: string, page: number): Promise<MangaPage> {
  const document = await load(`/member/search.aspx?key=${encodeURIComponent(query)}&page=${page}`);
  return cards(document, '.container .row a.comicpic_col6');
}

// ============================== Pages ===============================
// The reader page builds image urls in an obfuscated script: variable names, field offsets and constants
// change per request, the shape does not. One long string holds 47-char chapter records — server (2),
// chapter (2), page count (2), per-page codes (40), part (1), in a per-request order — and ends with
// hex-encoded url fragments. The loop `var X=lc(F(data,i*(K-2)+OFF,LEN))` says where each field is.

const AZ = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** j.js `lc`: two letters in base 52 (`Z?` is 8000+); other lengths are returned as is. */
function lc(code: string): string {
  if (code.length !== 2) return code;
  if (code[0] === 'Z') return String(8000 + AZ.indexOf(code[1]!));
  return String(AZ.indexOf(code[0]!) * 52 + AZ.indexOf(code[1]!));
}

function hexText(hex: string): string {
  let out = '';
  for (let i = 0; i + 1 < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

const escape = (name: string) => name.replace(/\$/g, '\\$');

function pageUrls(body: string, chapterUrl: string): string[] {
  const script = [...body.matchAll(/<script language="javascript">([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]!)
    .find((s) => s.includes('$("#comics-pics").html(xx)'));
  if (!script) throw new Error('無法找到圖片資料');
  const numbers = new Map([...script.matchAll(/var (\w+)=(\d+);/g)].map((m) => [m[1]!, Number(m[2])]));
  const loop = /for \(var i=0;i<(\d+);i\+\+\)\{(.*?)ps=(\w+);if\((\w+)==ch &&\(part==''\|\|part==(\w+)\)/.exec(script);
  if (!loop) throw new Error('無法解析圖片資料');
  const [, count, declarations, pagesVar, chapterVar, partVar] = loop;
  // var X=lc(F(data,i*(K±n)+OFF[,LEN]));
  const fields = new Map<string, { width: number; offset: number; length: number; data: string }>();
  for (const m of declarations!.matchAll(/var (\w+)=lc\((\w+)\((\w+),i\*\((\w+)([+-]\d+)\)\+(\d+)(?:,(\d+))?\)\);/g)) {
    const width = (numbers.get(m[4]!) ?? Number.NaN) + Number(m[5]);
    const data = new RegExp(`var ${escape(m[3]!)}='([^']*)'`).exec(script)?.[1] ?? '';
    fields.set(m[1]!, { width, offset: Number(m[6]), length: m[7] ? Number(m[7]) : 40, data });
  }
  const image = /<img s="'\+(.*?)\+'" draggable/.exec(script)?.[1] ?? '';
  const serverVar = /\w+\((\w+), ?0, ?1\)/.exec(image)?.[1];
  const codesVar = /\w+\((\w+),mm\(j\),3\)/.exec(image)?.[1];
  const field = (name: string | undefined, i: number) => {
    const f = name ? fields.get(name) : undefined;
    if (!f) throw new Error('無法解析圖片資料');
    return lc(f.data.substr(i * f.width + f.offset, f.length));
  };
  const any = fields.values().next().value!;
  const data = any.data;
  // Fragment k (1 = extension, 2 = "ic.", 3 = "com", 4 = "img") sits k*6 hex digits before the last record.
  const fragment = (k: number) =>
    hexText(data.substring(data.length - any.width - k * 6, data.length - any.width - k * 6 + 6));
  const ti = /var ti=(\d+)/.exec(script)?.[1] ?? '';

  const wanted = (/[?&]ch=([^&#]*)/.exec(chapterUrl)?.[1] ?? '1').split('-')[0]!;
  const part = /[a-z]$/.exec(wanted)?.[0] ?? '';
  const ch = (part && wanted.length > 1 ? wanted.slice(0, -1) : wanted) || '1';
  for (let i = 0; i < Number(count); i++) {
    const recordPart = field(partVar, i);
    if (field(chapterVar, i) !== ch || (part && part !== recordPart)) continue;
    const server = field(serverVar, i);
    const pages = Number(field(pagesVar, i));
    const codes = field(codesVar, i);
    const host = `${fragment(4)}${server[0]}.8${fragment(3)}${fragment(2)}${fragment(3)}`;
    const dir = `${ti}/${ch}${recordPart === '0' ? '' : recordPart}`;
    return Array.from({ length: pages }, (_, index) => {
      const j = index + 1;
      const mm = (Math.floor((j - 1) / 10) % 10) + ((j - 1) % 10) * 3;
      return `https://${host}/${server[1]}/${dir}/${String(j).padStart(3, '0')}_${codes.substr(mm, 3)}.${fragment(1)}`;
    });
  }
  throw new Error('找不到該章節');
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(page: number): Promise<MangaPage> {
      return cards(await load(`/comic/h-${page}.html`), '.container .row a.comicpic_col6');
    },
    async getLatest(page: number): Promise<MangaPage> {
      return cards(await load(`/comic/u-${page}.html`), '.container .row .cat2_list a');
    },
    async search(query: string, page: number): Promise<MangaPage> {
      const result = await search(query, page);
      // The site's own simplified->traditional fallback misses some characters (e.g. "复仇者学院").
      if (result.items.length || page !== 1) return result;
      const converted = toTraditional(query);
      return converted === query ? result : search(converted, 1);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const author = document
        .selectFirst('.item_content_box .item-info-author')
        ?.text()
        .replace(/^作者:\s*/, '');
      const statusText = document.selectFirst('.item_content_box .item-info-status')?.text().trim();
      const status: MangaStatus =
        statusText === '連載中' ? 'ongoing' : statusText === '已完結' ? 'completed' : 'unknown';
      return {
        url: manga.url,
        title: document.selectFirst('.item_content_box .h2')?.text() || manga.title,
        author: author || undefined,
        artist: author || undefined,
        description: document.selectFirst('.item_content_box .item_info_detail')?.text() || undefined,
        status,
        thumbnailUrl: document.selectFirst('.item-cover img')?.absUrl('src') || manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      return document
        .select('#chapters a, .comic_chapters a')
        .flatMap((a): Chapter[] => {
          const view = /cview\('(\d+)-([^.']+)\.html'/.exec(a.attr('onclick') ?? '');
          const href = a.attr('href') ?? '';
          const url = view
            ? `${CHAPTERS_URL}/online/new-${view[1]}.html?ch=${view[2]}`
            : href.startsWith('/online/')
              ? CHAPTERS_URL + href
              : href.startsWith('http')
                ? href
                : '';
          return url ? [{ url, name: a.text().trim() }] : [];
        })
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.get(chapter.url, { headers: { ...headers, Referer: `${BASE_URL}/` } });
      return pageUrls(response.body, response.url || chapter.url).map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${CHAPTERS_URL}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/html\/\d+\.html)/i.exec(url.trim());
      return match && match[1]!.toLowerCase().replace(/^www\./, '') === hostOf(BASE_URL).replace(/^www\./, '')
        ? { url: match[2]!, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
