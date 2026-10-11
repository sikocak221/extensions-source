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
import { USER_AGENT, hostOf, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://mangakuro.net';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const load = async (url: string) => html.load((await http.get(url, { headers })).body, { baseUrl: url });

async function list(path: string, page: number, param: string, value: string): Promise<MangaPage> {
  const doc = await load(`${BASE_URL}/${path}/${page}?${param}=${encodeURIComponent(value)}`);
  const items: MangaSummary[] = [];
  for (const el of doc.select('div.story_item')) {
    const a = el.selectFirst('div.mg_name a');
    if (!a) continue;
    items.push({
      url: relativeUrl(a.absUrl('href') ?? ''),
      title: a.text(),
      thumbnailUrl: el.selectFirst('img')?.absUrl('src'),
    });
  }
  return { items, hasNextPage: doc.selectFirst("a[title='Last Page']") !== null };
}

function parseStatus(text: string | undefined): MangaStatus {
  if (!text) return 'unknown';
  if (text.includes('進行中')) return 'ongoing';
  if (text.includes('完了')) return 'completed';
  if (text.includes('保留')) return 'hiatus';
  if (text.includes('キャンセル')) return 'cancelled';
  return 'unknown';
}

/** "3日前", "昨日", "2 時間前" → epoch ms. */
function parseDate(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const now = Date.now();
  if (text.includes('昨日')) return now - 86_400_000;
  const amount = Number(/(\d+)/.exec(text)?.[1]);
  if (!amount) return undefined;
  const unit = text.includes('秒')
    ? 1000
    : text.includes('分')
      ? 60_000
      : text.includes('時')
        ? 3_600_000
        : text.includes('日')
          ? 86_400_000
          : text.includes('週')
            ? 7 * 86_400_000
            : text.includes('月')
              ? 30 * 86_400_000
              : text.includes('年')
                ? 365 * 86_400_000
                : 0;
  return unit ? now - amount * unit : undefined;
}

const joined = (els: HtmlElement[], keep: (t: string) => boolean = () => true) =>
  [...new Set(els.map((e) => e.text()).filter(keep))].join(', ') || undefined;

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list('all-manga', page, 'sort', 'views'),
    getLatest: (page) => list('all-manga', page, 'sort', 'latest-updated'),
    search: (query, page) => list('search', page, 'keyword', query),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const doc = await load(BASE_URL + manga.url);
      return {
        url: manga.url,
        title: doc.selectFirst('div.detail_name > h1')?.text() ?? manga.title,
        author: joined(
          doc.select("div:has(.lnr-user) + .info_value a[href*='/authors/']"),
          (t) => t !== '未詳' && t !== '不明',
        ),
        status: parseStatus(doc.selectFirst('div:has(.lnr-leaf) + .info_value')?.text()),
        genres: doc.select('div.detail_listInfo a.genres-el').map((a) => a.text()),
        description: doc.selectFirst('.detail_reviewContent')?.text(),
        thumbnailUrl: doc.selectFirst('.detail_avatar img')?.absUrl('src') ?? manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const doc = await load(BASE_URL + manga.url);
      const chapters: Chapter[] = [];
      for (const item of doc.select('div.chapter_box .item')) {
        const a = item.selectFirst('a.chapter_num');
        if (!a) continue;
        chapters.push({
          url: relativeUrl(a.absUrl('href') ?? ''),
          name: a.text().replace(/^#/, '').trim(),
          uploadedAt: parseDate(selectIgnoreCase(item, 'p.chapter_info:nth-of-type(2)')[0]?.text()),
        });
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const url = BASE_URL + chapter.url;
      const doc = await load(url);
      const id = /CHAPTER_ID\s*=\s*(\d+);/.exec(doc.html())?.[1];
      if (!id) return [];
      const { body } = await http.get<{ status?: boolean; html: string }>(`${BASE_URL}/ajax/image/list/chap/${id}`, {
        headers: { ...headers, 'X-Requested-With': 'XMLHttpRequest', Referer: url },
        responseType: 'json',
      });
      if (!body.status) return [];
      return html
        .load(body.html, { baseUrl: url })
        .select('div.image_story img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const slug = /\/manga\/([^/?#]+)/.exec(url)?.[1];
      const host = hostOf(url);
      return slug && (host === hostOf(BASE_URL) || host.endsWith(`.${hostOf(BASE_URL)}`))
        ? { url: `/manga/${slug}`, title: '' }
        : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
