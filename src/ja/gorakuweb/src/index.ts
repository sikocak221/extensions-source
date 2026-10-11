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
import { USER_AGENT, findRscObject, htmlToText, parseDate } from './common/utils';

const BASE_URL = 'https://gorakuweb.com';
const HIDE_LOCKED = 'hide_locked';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const rscHeaders = { ...headers, rsc: '1' };

const CATEGORIES: [string, string, string][] = [
  ['すべて', 'series', ''],
  ['連載中', 'series', 'false'],
  ['連載終了', 'series', 'true'],
  ['ちょっとH', 'search', '2265225572180105560'],
  ['サスペンス・ホラー', 'search', '4436096323774752167'],
  ['裏社会・アングラ', 'search', '5625949039609423274'],
  ['ヒューマンドラマ', 'search', '2948889619045390126'],
  ['日常・グルメ', 'search', '8002052417606270687'],
  ['学園・青春', 'search', '8275313961510206169'],
  ['恋愛・ファンタジー', 'search', '2791600463112259269'],
  ['動物', 'search', '7606094847790899835'],
  ['バトル・アクション', 'search', '1671211288187869228'],
];

interface Entry {
  href: string;
  imageSrc?: string | null;
  title: string;
}
interface EpisodeProps {
  seriesTitle: string;
  seriesDescription?: string | null;
  author?: string | null;
  seriesThumbnailUrl?: string | null;
  shareUrl: string;
  episodeList: { href: string; title: string; openAt?: string | null; disabled?: boolean | null }[];
  base: string;
  metadata: { pages: { filename: string; page: number }[] };
  accessKey: string;
  keyBytes: string;
  ivBytes: string;
}

const seg1 = (href: string) =>
  href
    .replace(/^https?:\/\/[^/]+/, '')
    .split('/')
    .filter(Boolean)[1] ?? '';
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
const isEntry = (v: unknown): v is Entry =>
  !!v && typeof v === 'object' && 'href' in v && 'title' in v && 'imageSrc' in v;
const toManga = (e: Entry): MangaSummary => ({
  url: `/${seg1(e.href)}`,
  title: e.title,
  thumbnailUrl: e.imageSrc ?? undefined,
});

function entryArray(body: string): Entry[] {
  const holder = findRscObject<Record<string, unknown>>(body, (o) =>
    Object.values(o).some((v) => Array.isArray(v) && v.length > 0 && v.every(isEntry)),
  );
  const arr = Object.values(holder ?? {}).find((v) => Array.isArray(v) && v.length > 0 && v.every(isEntry));
  return (arr as Entry[] | undefined) ?? [];
}

type Doc = ReturnType<typeof html.load>;
function parseCards(doc: Doc, selector: string): MangaSummary[] {
  const items: MangaSummary[] = [];
  for (const el of doc.select(selector)) {
    const a = el.selectFirst('a');
    const title = el.selectFirst('h3')?.text().trim();
    if (!a || !title) continue;
    items.push({ url: `/${seg1(a.absUrl('href') ?? '')}`, title, thumbnailUrl: el.selectFirst('img')?.absUrl('src') });
  }
  return items;
}

const hexBytes = (hex: string) => {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
};

async function episodeProps(url: string): Promise<EpisodeProps | undefined> {
  return findRscObject<EpisodeProps>(await rsc(url), (o) => 'episodeList' in o && 'keyBytes' in o);
}

export default defineExtension({
  preferences: () => [{ type: 'switch', key: HIDE_LOCKED, label: 'Hide Locked Chapters', default: false }],
  createSource: () => ({
    baseUrl: BASE_URL,
    imageHeaders: () => headers,
    async getPopular(): Promise<MangaPage> {
      return { items: entryArray(await rsc(`${BASE_URL}/?_rsc=1`)).map(toManga), hasNextPage: false };
    },
    async getLatest(): Promise<MangaPage> {
      const res = await http.get(BASE_URL, { headers });
      const doc = html.load(res.body, { baseUrl: res.url });
      return { items: parseCards(doc, 'section:has(h2:contains(更新作品)) div.bdr_lg.group'), hasNextPage: false };
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
      const cardsAt = async (url: string): Promise<MangaPage> => {
        const res = await http.get(url, { headers });
        const doc = html.load(res.body, { baseUrl: res.url });
        return { items: parseCards(doc, 'div.bdr_lg.group'), hasNextPage: false };
      };
      if (query.trim()) return cardsAt(`${BASE_URL}/search?keyword=${encodeURIComponent(query)}`);
      const [type, value] = (typeof filters.category === 'string' ? filters.category : 'series|').split('|') as [
        string,
        string,
      ];
      if (type === 'search') return cardsAt(`${BASE_URL}/search?id=${value}`);
      const list = findRscObject<{ cardList: Entry[][] }>(
        await rsc(`${BASE_URL}/series?completed=${value}`),
        (o) => 'cardList' in o,
      );
      return { items: (list?.cardList ?? []).flat().map(toManga), hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const d = await episodeProps(`${BASE_URL}/episode${manga.url}`);
      if (!d) throw new Error('Series not found');
      return {
        url: manga.url,
        title: d.seriesTitle,
        description: d.seriesDescription ? htmlToText(d.seriesDescription) : undefined,
        author: d.author ?? undefined,
        thumbnailUrl: d.seriesThumbnailUrl ?? manga.thumbnailUrl,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const hideLocked = prefs.get<boolean>(HIDE_LOCKED) === true;
      const d = await episodeProps(`${BASE_URL}/episode${manga.url}`);
      if (!d) return [];
      return d.episodeList
        .filter((e) => !hideLocked || e.disabled !== true)
        .map((e) => ({
          url: e.href.replace(/^https?:\/\/[^/]+/, ''),
          name: `${e.disabled ? '🔒 ' : ''}${e.title}`,
          uploadedAt: parseDate(e.openAt, 'yyyy/MM/dd'),
        }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const d = await episodeProps(`${BASE_URL}${chapter.url}`);
      if (!d) throw new Error('This chapter is not available.');
      return d.metadata.pages.map((p, i) => ({
        index: i,
        imageUrl: `${d.base}/${p.filename}?__token__=${d.accessKey}#${d.keyBytes}:${d.ivBytes}`,
      }));
    },
    transformImage(page: Page, bytes: Uint8Array): ImageTransform {
      const fragment = (page.imageUrl ?? '').split('#')[1];
      if (!fragment || !fragment.includes(':')) return {};
      const [key, iv] = fragment.split(':') as [string, string];
      return { bytes: crypto.aesDecrypt(bytes, hexBytes(key), { mode: 'cbc', iv: hexBytes(iv) }) };
    },
    getWebUrl: (item) => (item.url.split('/').length > 2 ? `${BASE_URL}${item.url}` : `${BASE_URL}/episode${item.url}`),
  }),
});
