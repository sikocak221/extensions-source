import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, relativeUrl } from './common/utils';

const BASE_URL = 'https://lelscans.net';
// A stable reader page guaranteed to carry the navigation dropdowns and latest section.
const CATALOG_PAGE = `${BASE_URL}/lecture-en-ligne-one-piece`;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

// The series dropdown of the Tachiyomi version is gone: the "hot" series of the reader page are the catalog now.
function catalogMangas(document: HtmlElement): MangaSummary[] {
  const seen = new Set<string>();
  return document.select('#main_hot_ul li').flatMap((li): MangaSummary[] => {
    const a = li.selectFirst('a.hot_manga_img');
    if (!a) return [];
    const url = relativeUrl(a.absUrl('href') || a.attr('href') || '');
    if (seen.has(url)) return [];
    seen.add(url);
    return [
      {
        url,
        title: (a.attr('title') ?? '').replace(/ Scan$/, ''),
        thumbnailUrl: li.selectFirst('a.hot_manga_img img')?.absUrl('src') || undefined,
      },
    ];
  });
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      return { items: catalogMangas(await load(CATALOG_PAGE)), hasNextPage: false };
    },
    async getLatest(): Promise<MangaPage> {
      return { items: catalogMangas(await load(CATALOG_PAGE)), hasNextPage: false };
    },
    // No server-side search: the catalog list is filtered client-side.
    async search(query): Promise<MangaPage> {
      const needle = query.trim().toLowerCase();
      const items = catalogMangas(await load(CATALOG_PAGE)).filter((m) => m.title.toLowerCase().includes(needle));
      return { items, hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(`${BASE_URL}${manga.url}`);
      const title = document.selectFirst('h1')?.text() ?? '';
      const cover = document.selectFirst('meta[property=og:image]')?.attr('content');
      return {
        url: manga.url,
        title: title.replace(/^Lecture en ligne /, '').replace(/ scan$/i, '') || manga.title,
        thumbnailUrl: cover ? `${BASE_URL}${cover}` : manga.thumbnailUrl,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(`${BASE_URL}${manga.url}`);
      // The chapter dropdown of the reader header (descending order).
      return (document.select('#header-image select')[0]?.select('option') ?? []).map((option) => {
        const number = Number.parseFloat(option.text());
        const known = !Number.isNaN(number);
        return {
          url: relativeUrl(option.absUrl('value') || option.attr('value') || ''),
          name: `Chapitre ${known ? String(number) : option.text()}`,
          number: known ? number : -1,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(`${BASE_URL}${chapter.url}/1`);
      // The page links ("Prec", 1, 2, … "Suiv") of the navigation bar; the image is on each page.
      const pages = document
        .select('#navigation a')
        .filter((a) => /^\d+$/.test(a.text().trim()))
        .map((a) => a.absUrl('href') || a.attr('href') || '');
      return pages.map((url, index) => ({ index, url }));
    },
    async getImageUrl(page: Page): Promise<string> {
      return (await load(page.url ?? '')).selectFirst('#image img')?.absUrl('src') ?? '';
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
    resolveUrl(url): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?lelscans\.net(\/lecture-(?:en-ligne|ligne)-[^/?#]+)/i.exec(url);
      return match ? { url: match[1]!, title: '' } : null;
    },
  }),
});
