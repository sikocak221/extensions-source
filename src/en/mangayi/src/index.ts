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
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://mangayi.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
let pageSize = 24;

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

// Manga urls are "/read/<slug>/".
async function search(payload: { p: number; s?: string; t?: number }): Promise<MangaPage> {
  const data = (
    await http.post<{ results: { i: string; t: string }[]; total: number }>(
      `${BASE_URL}/api/search`,
      { json: payload },
      { headers, responseType: 'json' },
    )
  ).body;
  pageSize = Math.max(pageSize, data.results.length);
  return {
    items: data.results.map((m) => ({
      url: `/read/${m.i}/`,
      title: m.t,
      thumbnailUrl: `https://scp.keterfoundation.com/cover/${m.i}.jpg`,
    })),
    hasNextPage: payload.p * pageSize < data.total,
  };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => search({ p: page, t: 1 }),
    search: (query, page) => search({ p: page, s: query.trim() }),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const statuses: Record<string, MangaStatus> = {
        ongoing: 'ongoing',
        completed: 'completed',
        hiatus: 'hiatus',
        'on hiatus': 'hiatus',
        cancelled: 'cancelled',
      };
      return {
        url: manga.url,
        title: document.selectFirst('h1.m-title')?.text() || manga.title,
        author: document.selectFirst('.m-authors')?.text() || undefined,
        description:
          document
            .select('.m-summary p')
            .map((p) => p.text())
            .join('\n') || undefined,
        genres: document.select('.m-genres .pill').map((e) => e.text()),
        status:
          statuses[document.selectFirst('.m-stat:contains(Status) .value')?.text().toLowerCase() ?? ''] ?? 'unknown',
        thumbnailUrl: document.selectFirst('.cover-wrap img.cover-image')?.absUrl('src') || manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      return document.select('div.chapters-list a.c:not(.unreleased)').map((a) => ({
        url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
        name: a.selectFirst('.t')?.text() ?? a.text(),
        uploadedAt: parseDate(a.selectFirst('.chapter-d')?.text(), 'd MMMM yyyy'),
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      return document
        .select('div.c-images img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.attr('src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/read\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/read/${match[2]}/`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
