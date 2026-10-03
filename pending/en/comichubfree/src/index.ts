import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://comichubfree.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const NEXT = 'ul.pagination a[rel=next]';

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const image = (img: HtmlElement | null | undefined) =>
  (img?.attr('data-src') ? img.absUrl('data-src') : img?.absUrl('src')) || undefined;

async function list(url: string): Promise<MangaPage> {
  const document = await load(url);
  const items = document.select('.movie-list-index > .cartoon-box:has(.detail)').flatMap((box): MangaSummary[] => {
    const link = box.selectFirst('a');
    const title = box.selectFirst('h3')?.text();
    if (!link || !title) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title,
        thumbnailUrl: image(box.selectFirst('img')),
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst(NEXT) != null };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`/popular-comic?page=${page}`),
    getLatest: (page) => list(`/new-comic?page=${page}`),
    search: (query, page) => list(`/search-comic?key=${encodeURIComponent(query.trim())}&page=${page}`),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const info = document.selectFirst('div.movie-info div.series-info');
      const status = info?.selectFirst('dt:contains(Status:) + dd')?.text() ?? '';
      return {
        url: manga.url,
        title: document.selectFirst('div.movie-info h1')?.text() || manga.title,
        description: document.selectFirst('div.movie-info div#film-content')?.text() || undefined,
        thumbnailUrl: image(info?.selectFirst('img')) ?? manga.thumbnailUrl,
        author: info?.selectFirst('dt:contains(Authors:) + dd')?.text() || undefined,
        status: status === 'Ongoing' ? 'ongoing' : status === 'Completed' ? 'completed' : 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const chapters: Chapter[] = [];
      let document: HtmlElement | null = await load(manga.url);
      for (const seen = new Set<string>(); document;) {
        for (const row of document.select('div.episode-list > div > table > tbody > tr')) {
          const link = row.selectFirst('a');
          if (!link) continue;
          const cells = row.select('td');
          chapters.push({
            url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
            name: link.text(),
            uploadedAt: parseDate(cells[cells.length - 1]?.text(), 'd-MMM-yyyy'),
          });
        }
        const next: string | undefined = document.selectFirst(NEXT)?.absUrl('href');
        if (!next || seen.has(next)) break;
        seen.add(next);
        document = await load(next);
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(`${chapter.url}/all`);
      const urls = document.select('img.chapter_img').map((img) => image(img) ?? '');
      return [...new Set(urls.filter(Boolean))].map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/comic\/[^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
