import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, parseDate } from './common/utils';

const BASE_URL = 'https://www.lolobun.com';
const COVER_URL = 'https://osrs.sfacg.com/web/comic/images/Logo';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const HIDE_LOCKED: Preference = {
  type: 'switch',
  key: 'hide_locked_chapters',
  label: 'Hide locked chapters',
  description: "Don't list paid chapters (🔒). Refresh a comic's chapter list to apply.",
  default: false,
};

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function data<T>(response: { status: { errorCode: number; msg?: string | null }; data?: T | null }): T {
  if (response.data == null)
    throw new Error(response.status.msg ?? `Request failed with code ${response.status.errorCode}`);
  return response.data;
}

async function home(): Promise<MangaPage> {
  const seen = new Set<string>();
  const items = (await load('/')).select('.section-item:has(a.name[href^="/c/"])').flatMap((item): MangaSummary[] => {
    const link = item.selectFirst('a.name');
    const id = (link?.attr('href') ?? '').split('/').pop() ?? '';
    if (!link || !id || seen.has(id)) return [];
    seen.add(id);
    return [
      { url: `/c/${id}`, title: link.text(), thumbnailUrl: item.selectFirst('img.cover')?.absUrl('src') || undefined },
    ];
  });
  return { items, hasNextPage: false };
}

// Manga urls are "/c/<id>", chapter urls "/c/<id>/<chapter id>".
export default defineExtension({
  preferences: () => [HIDE_LOCKED],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: () => home(),
    async search(query: string, page: number): Promise<MangaPage> {
      if (!query.trim()) return home();
      const url = `${BASE_URL}/ajax/Common.ashx?op=searchWorks&q=${encodeURIComponent(query.trim())}&type=comic&pi=${page - 1}`;
      const result = data(
        (
          await http.get<{
            status: { errorCode: number; msg?: string };
            data?: { HasMore: boolean; Items: { EntityId: number; Title: string; Cover?: string | null }[] };
          }>(url, { headers, responseType: 'json' })
        ).body,
      );
      return {
        items: result.Items.map((i) => ({
          url: `/c/${i.EntityId}`,
          title: i.Title,
          thumbnailUrl: i.Cover ? (i.Cover.startsWith('http') ? i.Cover : `${COVER_URL}/${i.Cover}`) : undefined,
        })),
        hasNextPage: result.HasMore,
      };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const info = (document.selectFirst('.header-item-info .info')?.text() ?? '').split('·').map((s) => s.trim());
      const status = info[0]?.toLowerCase();
      return {
        url: manga.url,
        title: document.selectFirst('.header-item-info .name')?.text() || manga.title,
        thumbnailUrl: document.selectFirst('img.header-item-cover')?.absUrl('src') || manga.thumbnailUrl,
        description: document.selectFirst('#comic-desc')?.text().trim() || undefined,
        status: status === 'ongoing' ? 'ongoing' : status === 'completed' ? 'completed' : 'unknown',
        genres: info.slice(1).filter(Boolean),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      const hideLocked = prefs.get<boolean>(HIDE_LOCKED.key) === true;
      const latest = parseDate(document.selectFirst('.lastest-update-time')?.text(), 'MM/dd/yyyy');
      const items = document.select('.catalog-list .catalog-item');
      let previous = 0;
      let extras = 0;
      const chapters: Chapter[] = [];
      items.forEach((item, index) => {
        const link = item.selectFirst('.title a');
        if (!link) return;
        const title = link.text();
        const match = /^chapter\s*(\d+(?:\.\d+)?)$/i.exec(title);
        let number: number;
        if (match) {
          number = previous = Number(match[1]);
          extras = 0;
        } else number = previous + ++extras / 100;
        const locked = item.selectFirst('.icon-box img[src*=lock]') != null;
        if (locked && hideLocked) return;
        chapters.push({
          url: `/c/${(link.attr('href') ?? '').split('/c/')[1] ?? ''}`,
          name: locked ? `🔒 ${title}` : title,
          number,
          uploadedAt: index === items.length - 1 ? latest : undefined,
        });
      });
      return chapters.reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const form = { chapId: chapter.url.split('/').pop() ?? '' };
      const response = await http.post<{ status: { errorCode: number; msg?: string }; data?: string[] }>(
        `${BASE_URL}/ajax/comic.ashx?op=getChapterPic`,
        { form },
        { headers, responseType: 'json' },
      );
      return data(response.body).map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/c\/(\d+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase().replace(/^www\./, '') === hostOf(BASE_URL).replace(/^www\./, '')
        ? { url: `/c/${match[2]}`, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
