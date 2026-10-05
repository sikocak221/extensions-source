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

const BASE_URL = 'https://zonatmo.org';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const ajaxHeaders = { ...headers, Referer: `${BASE_URL}/biblioteca`, 'X-Requested-With': 'XMLHttpRequest' };

// Manga urls are the canonical `/library/<type>/<id>/<slug>` pages. The latest-uploads page doesn't link
// them, so those entries get `/biblioteca?title=…&type=…` and are resolved through the search suggestions.

async function load(url: string): Promise<{ document: HtmlElement; body: string }> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return { document: html.load(response.body, { baseUrl: response.url }), body: response.body };
}

const identityUrl = (title: string, type?: string) =>
  `/biblioteca?title=${encodeURIComponent(title.toLowerCase())}${type ? `&type=${encodeURIComponent(type)}` : ''}`;

async function canonicalUrl(url: string): Promise<string> {
  if (url.startsWith('/library/')) return url;
  const title = decodeURIComponent(/[?&]title=([^&]*)/.exec(url)?.[1] ?? '');
  const type = /[?&]type=([^&]*)/.exec(url)?.[1];
  const suggestions = (
    await http.get<{ title?: string; url?: string; type?: string }[]>(
      `${BASE_URL}/api/search/suggest?q=${encodeURIComponent(title)}`,
      { headers, responseType: 'json' },
    )
  ).body;
  const match = suggestions.find(
    (s) =>
      s.title?.trim().toLowerCase() === title.trim() &&
      (!type || s.type?.toLowerCase() === type.toLowerCase()) &&
      s.url?.includes('/library/'),
  );
  if (!match?.url) throw new Error('No se encontró la ficha del manga');
  return relativeUrl(absoluteUrl(BASE_URL, match.url));
}

async function library(page: number, query = ''): Promise<MangaPage> {
  const params = `title=${encodeURIComponent(query.trim())}&filter_by=title&order_item=likes_count&order_dir=desc&_pg=1&page=${page}`;
  const json = (
    await http.get<{ html: string }>(`${BASE_URL}/biblioteca?${params}`, { headers: ajaxHeaders, responseType: 'json' })
  ).body;
  const document = html.load(json.html, { baseUrl: BASE_URL });
  const items = document.select('#library-grid .element').flatMap((element): MangaSummary[] => {
    const link = element.selectFirst('a[href*="/library/"]');
    const href = link?.absUrl('href');
    const h4 = link?.selectFirst('.thumbnail-title h4');
    const title = (h4?.attr('title') || h4?.text() || '').trim();
    if (!link || !href || !title) return [];
    return [
      {
        url: relativeUrl(href),
        title,
        thumbnailUrl:
          link.selectFirst('img.cover-bg-img')?.absUrl('src') ||
          link.selectFirst('.thumbnail.book')?.attr('data-bg') ||
          undefined,
      },
    ];
  });
  const hasNextPage =
    document.selectFirst('a[rel=next]') !== null ||
    document.select('.pagination a').some((a) => /Siguiente|›/.test(a.text()));
  return { items, hasNextPage };
}

/** The blocks after `<h5 class="element-subtitle">label</h5>`, up to the next subtitle. */
function subtitleSection(body: string, label: string): HtmlElement | undefined {
  const parts = body.split(/<h5 class="element-subtitle">/);
  const section = parts.find((part) => part.split('</h5>')[0]!.trim().toLowerCase() === label.toLowerCase());
  return section ? html.load(section.slice(section.indexOf('</h5>') + 5)) : undefined;
}

function statusOf(text: string): MangaStatus {
  const value = text.toLowerCase();
  if (['en emisión', 'en emision', 'publicándose', 'publicandose'].includes(value)) return 'ongoing';
  if (['completado', 'finalizado'].includes(value)) return 'completed';
  if (['en pausa', 'hiatus'].includes(value)) return 'hiatus';
  if (value === 'cancelado') return 'cancelled';
  return 'unknown';
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => library(page),
    async getLatest(page: number): Promise<MangaPage> {
      const { document } = await load(`/ultimas-subidas?page=${page}`);
      const seen = new Set<string>();
      const items = document.select('.upload-file-row').flatMap((row): MangaSummary[] => {
        const title = row.selectFirst('.thumbnail-title h4')?.text().trim();
        if (!title) return [];
        const type = row.selectFirst('.book-type')?.text().trim().toLowerCase().replace(/ /g, '_');
        const url = identityUrl(title, type);
        if (seen.has(url)) return [];
        seen.add(url);
        const style = row.selectFirst('style')?.html() ?? '';
        return [{ url, title, thumbnailUrl: /background-image:\s*url\(['"]?([^'")]+)/.exec(style)?.[1] }];
      });
      return { items, hasNextPage: document.selectFirst('a[rel=next]') !== null };
    },
    search: (query, page) => library(page, query),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document, body } = await load(await canonicalUrl(manga.url));
      const names = (label: string) => [
        ...new Set(
          subtitleSection(body, label)
            ?.select('a')
            .map((a) => a.text().trim())
            .filter(Boolean) ?? [],
        ),
      ];
      const statusText = subtitleSection(body, 'Estado')?.selectFirst('*')?.text().trim() ?? '';
      return {
        url: manga.url,
        title: document.selectFirst('h1.element-title')?.text() || manga.title,
        thumbnailUrl: document.selectFirst('img.book-thumbnail')?.absUrl('src') || manga.thumbnailUrl,
        description: document.selectFirst('#manga-synopsis')?.text().trim() || undefined,
        genres: document.select('.element-header-content-text a[href*="/tag/"]').map((a) => a.text().trim()),
        author: names('Autor/es').join(', ') || undefined,
        artist: names('Artista/s').join(', ') || undefined,
        status: statusOf(statusText),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { document } = await load(await canonicalUrl(manga.url));
      const seen = new Set<string>();
      return document.select('li.upload-link').flatMap((row) => {
        const number = row.attr('data-chapter-number') || row.selectFirst('.chapter-number')?.attr('data-number') || '';
        const date = parseDate(row.selectFirst('.text-muted.small')?.text().trim().split(' ').pop(), 'dd/MM/yyyy');
        return row.select('.chapter-detail a[href*="/view_uploads/"]').flatMap((link): Chapter[] => {
          const url = relativeUrl(link.absUrl('href') ?? '');
          if (seen.has(url)) return [];
          seen.add(url);
          return [{ url, name: `Capítulo ${number}`, number: Number(number) || undefined, uploadedAt: date }];
        });
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document } = await load(chapter.url);
      return document
        .select('#reader-wrap img.reader-image')
        .map((img) => img.absUrl('src') ?? '')
        .filter(Boolean)
        .map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/library\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase().replace(/^www\./, '') === hostOf(BASE_URL)
        ? { url: match[2]!, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
