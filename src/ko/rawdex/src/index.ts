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
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://rawdex.net';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string): Promise<{ document: HtmlElement; status: number }> {
  const response = await http.request<string>({ url: absoluteUrl(BASE_URL, url), headers });
  return { document: html.load(response.body, { baseUrl: response.url }), status: response.status };
}

// Pagination links claim more pages than exist near the end of the archive; those answer 404 with zero cards.
async function browse(url: string): Promise<MangaPage> {
  const { document } = await load(url);
  const items = document.select('article.rdx-library-card').flatMap((card): MangaSummary[] => {
    const link = card.selectFirst('.rdx-library-card__body h2 a');
    const title = link?.text();
    if (!link || !title) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title,
        thumbnailUrl: card.selectFirst('.rdx-library-card__cover img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: items.length > 0 && document.selectFirst('a.next.page-numbers') !== null };
}

function relativeDate(text: string): number | undefined {
  const match = /(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/.exec(text.trim());
  if (!match) return undefined;
  const unit = {
    second: 1_000,
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
    month: 2_592_000_000,
    year: 31_536_000_000,
  }[match[2] as 'second'];
  return Date.now() - Number(match[1]) * unit;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => browse(`/manga/page/${page}/?m_orderby=views`),
    getLatest: (page) => browse(`/manga/page/${page}/?m_orderby=latest`),
    search: (query, page) => browse(withQuery(`/`, { s: query, spage: page > 1 ? String(page) : undefined })),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(manga.url);
      const title = document.selectFirst('.rdx-manga-heading h1')?.text();
      if (!title) throw new Error('Failed to parse title');
      const statusText = document.selectFirst('.rdx-manga-status')?.text().toLowerCase();
      const status: MangaStatus =
        statusText === 'on-going' ? 'ongoing' : statusText === 'end' ? 'completed' : 'unknown';
      let author: string | undefined;
      let artist: string | undefined;
      for (const row of document.select('dl.rdx-manga-meta div')) {
        const value = row.selectFirst('dd')?.text() || undefined;
        const key = row.selectFirst('dt')?.text().toLowerCase();
        if (key === 'author') author = value;
        else if (key === 'artist') artist = value;
      }
      const genres = document.select('.rdx-manga-tags a').map((a) => a.text());
      const altNames = (document.selectFirst('.rdx-manga-alternative')?.text() ?? '')
        .split(/[/;]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const summary = document.selectFirst('.rdx-manga-summary')?.text();
      const description = [
        summary,
        altNames.length ? `Alternative Names:\n${altNames.map((n) => `- ${n}`).join('\n')}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      return {
        url: manga.url,
        title,
        thumbnailUrl: document.selectFirst('img.rdx-manga-cover')?.absUrl('src') || manga.thumbnailUrl,
        status,
        author,
        artist,
        genres: genres.length ? genres : undefined,
        description: description || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { document } = await load(manga.url);
      return document.select('.rdx-chapter-list > a.rdx-chapter-row').flatMap((row): Chapter[] => {
        const name = row.selectFirst('.rdx-chapter-row__label')?.text();
        if (!name) return [];
        const number = /(\d+(?:\.\d+)?)/.exec(name)?.[1];
        return [
          {
            url: relativeUrl(row.absUrl('href') || row.attr('href') || ''),
            name,
            number: number ? Number(number) : undefined,
            uploadedAt: relativeDate(row.selectFirst('.rdx-chapter-row__date')?.text() ?? ''),
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document } = await load(chapter.url);
      const pages = document
        .select('.rdx-reader-page img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.attr('src') || '' }));
      if (pages.length === 0) throw new Error('No pages found');
      return pages;
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/manga\/[^/?#]+\/?)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
