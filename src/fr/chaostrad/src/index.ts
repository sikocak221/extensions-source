import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://chaostrad.fr';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

function normalizeSeriesTitle(rawTitle: string): string {
  return rawTitle
    .replace(/^Chapitre de /, '')
    .replace(/^Voir le chapitre /, '')
    .replace(/ #[^#]*$/, '')
    .trim();
}

function formatChapterName(number: number): string {
  return `#${number >= 0 ? String(number) : '?'}`;
}

async function load(url: string) {
  const response = await http.get(url, { headers });
  return { document: html.load(response.body, { baseUrl: response.url }), path: relativeUrl(response.url) };
}

/**
 * Builds the series list by reading the comics navigation menu. Collection links (/search/...) are followed to
 * discover their constituent series.
 */
async function parseCatalog(): Promise<MangaSummary[]> {
  const list: MangaSummary[] = [];
  const added = new Set<string>();
  const { document } = await load(BASE_URL);
  for (const link of document.select('#comics-submenu a[href]')) {
    const href = (link.attr('href') ?? '').trim();
    const title = normalizeSeriesTitle(link.attr('title') ?? '');
    if (href.startsWith('/comics/')) {
      if (added.has(href)) continue;
      added.add(href);
      list.push({ url: href, title });
    } else if (href.startsWith('/search/')) {
      // May be a collection page or a redirect to a single series
      const { document: sub, path: finalPath } = await load(`${BASE_URL}${href}`);
      if (finalPath.startsWith('/search/')) {
        // True collection page: each a.comic-link leads to a series
        for (const colLink of sub.select('a.comic-link[href]')) {
          const colHref = relativeUrl(colLink.absUrl('href') || colLink.attr('href') || '');
          let seriesPath: string;
          if (colHref.startsWith('/comics/')) {
            const slug = colHref.split('/')[2];
            if (!slug) continue;
            seriesPath = `/comics/${slug}`;
          } else if (colHref.startsWith('/search/')) seriesPath = colHref;
          else continue;
          if (added.has(seriesPath)) continue;
          added.add(seriesPath);
          list.push({ url: seriesPath, title: normalizeSeriesTitle(colLink.attr('title') ?? '') });
        }
      } else {
        // Redirected to a series or reader page
        const parts = finalPath.split('/');
        const seriesPath = parts.length >= 4 && parts[1] === 'comics' ? `/comics/${parts[2]}` : finalPath;
        if (added.has(seriesPath)) continue;
        added.add(seriesPath);
        const seriesTitle = normalizeSeriesTitle(
          sub.selectFirst('h1')?.text().trim() || sub.selectFirst('title')?.text() || '',
        );
        list.push({ url: seriesPath, title: seriesTitle || title });
      }
    }
  }
  return list;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      return { items: await parseCatalog(), hasNextPage: false };
    },
    async search(query): Promise<MangaPage> {
      const needle = query.trim().toLowerCase();
      const all = await parseCatalog();
      return { items: needle ? all.filter((m) => m.title.toLowerCase().includes(needle)) : all, hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(`${BASE_URL}${manga.url}`);
      return {
        url: manga.url,
        title:
          normalizeSeriesTitle(
            document.selectFirst('h1')?.text().trim() || document.selectFirst('title')?.text() || '',
          ) || manga.title,
        // First chapter thumbnail on a series list page, or first page on a reader page
        thumbnailUrl:
          document.selectFirst("a.comic-link img[src*='_thumbnail']")?.absUrl('src') ||
          document.selectFirst('img.comic-image')?.absUrl('src') ||
          undefined,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { document, path } = await load(`${BASE_URL}${manga.url}`);
      const links = document.select('a.comic-link');
      // Single chapter series
      if (links.length === 0) {
        const number = Number.parseFloat(path.substring(path.lastIndexOf('/') + 1));
        const n = Number.isNaN(number) ? 1 : number;
        return [{ url: path, name: formatChapterName(n), number: n }];
      }
      return links
        .map((link): Chapter => {
          const href = (link.attr('href') ?? '').trim();
          const number = Number.parseFloat(href.substring(href.lastIndexOf('/') + 1));
          const n = Number.isNaN(number) ? -1 : number;
          return {
            url: href,
            name: formatChapterName(n),
            number: n,
            uploadedAt: parseDate(link.selectFirst('p.release-date')?.text(), 'd.M.yyyy'),
          };
        })
        .sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document } = await load(`${BASE_URL}${chapter.url}`);
      return document.select('img.comic-image').map((img, index) => ({ index, imageUrl: img.absUrl('src') }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
    resolveUrl(url): MangaSummary | null {
      const match = /^https?:\/\/chaostrad\.fr(\/comics\/[^/?#]+)/i.exec(url);
      return match ? { url: match[1]!, title: '' } : null;
    },
  }),
});
