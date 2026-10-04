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
import { parseArabicDate } from './arabic-date';
import { USER_AGENT, absoluteUrl, hostOf, ownText, relativeUrl } from './common/utils';

const BASE_URL = 'https://hentailek.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function parseListing(document: HtmlElement, page: number): MangaPage {
  const items = document.select("a[href*='/manga/']:not([href*='/chapter-'])").flatMap((link): MangaSummary[] => {
    const href = link.absUrl('href');
    if (!href || !href.includes('/manga/') || href.includes('/chapter-')) return [];
    const img = link.selectFirst('img[src]');
    const title = link.selectFirst('h3')?.text() || link.attr('aria-label') || img?.attr('alt');
    if (!title?.trim()) return [];
    return [{ url: relativeUrl(href), title: title.trim(), thumbnailUrl: img?.absUrl('src') || undefined }];
  });
  const seen = new Set<string>();
  const unique = items.filter((manga) => !seen.has(manga.url) && !!seen.add(manga.url));
  const hasNextPage = document.select("a[href*='page=']").some((link) => {
    const linkPage = Number.parseInt(/page=(\d+)/.exec(link.attr('href') ?? '')?.[1] ?? '', 10);
    return linkPage === page + 1;
  });
  return { items: unique, hasNextPage };
}

const listingUrl = (popular: boolean, page: number) =>
  `/library${popular || page > 1 ? '?' : ''}${[popular ? 'sort=popular' : '', page > 1 ? `page=${page}` : ''].filter(Boolean).join('&')}`;

const infoValue = (document: HtmlElement, key: string) =>
  document.selectFirst(`dt:contains(${key}) + dd`)?.text().trim() || undefined;

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(page): Promise<MangaPage> {
      return parseListing(await load(listingUrl(true, page)), page);
    },
    async getLatest(page): Promise<MangaPage> {
      return parseListing(await load(listingUrl(false, page)), page);
    },
    // The site's search does not paginate ("page" returns 0 results beyond 1).
    async search(query, page): Promise<MangaPage> {
      return parseListing(await load(`/search?q=${encodeURIComponent(query.trim())}`), page);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const statusText = infoValue(document, 'الحالة') ?? '';
      const status: MangaStatus = statusText.includes('مكتمل')
        ? 'completed'
        : statusText.includes('مستمر')
          ? 'ongoing'
          : statusText.includes('متوقف')
            ? 'hiatus'
            : 'unknown';
      const description = document
        .select('p.border-t.text-sm.leading-relaxed')
        .map((p) => p.text())
        .reduce((best, text) => (text.length > best.length ? text : best), '');
      return {
        url: manga.url,
        title: document.selectFirst('h1')?.text() || manga.title,
        thumbnailUrl:
          document.selectFirst("img[src*='cover']")?.absUrl('src') ||
          document.selectFirst("meta[property='og:image']")?.attr('content') ||
          manga.thumbnailUrl,
        status,
        author: infoValue(document, 'المؤلف'),
        artist: infoValue(document, 'الرسم'),
        genres: infoValue(document, 'التصنيفات')?.split(/\s*[,،]\s*/),
        description: description || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      return document.select("a[href*='/chapter-'][class*='group']").flatMap((link): Chapter[] => {
        const href = link.absUrl('href');
        if (!href) return [];
        const name = link
          .select('span')
          .map((span) => ownText(span))
          .find((text) => text.includes('الفصل'));
        return [
          {
            url: relativeUrl(href),
            name: name || href.slice(href.lastIndexOf('/') + 1),
            uploadedAt: parseArabicDate(link.selectFirst('span.text-xs.text-muted')?.text()),
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      return document
        .select('.reader-page img[src], .reader-page img[data-src], .on-canvas img')
        .map((img) => img.absUrl('src') || img.absUrl('data-src'))
        .filter(Boolean)
        .map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/manga\/[^/?#]+)\/?(?:[?#].*)?$/i.exec(url.trim());
      return match && match[1]!.toLowerCase().replace(/^www\./, '') === hostOf(BASE_URL)
        ? { url: match[2]!, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
