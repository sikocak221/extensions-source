import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://yaoihot.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

async function list(url: string): Promise<MangaPage> {
  const document = await load(url);
  const items = document.select('.manga-grid .manga-card').flatMap((card): MangaSummary[] => {
    const link = card.selectFirst('.manga-card-link');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: card.selectFirst('.manga-card-title')?.text() ?? '',
        thumbnailUrl: card.selectFirst('.manga-cover-img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('.next.page-numbers') != null };
}

const paged = (page: number) => (page > 1 ? `page/${page}/` : '');

function relativeDate(text: string): number | undefined {
  const value = text.trim().toLowerCase();
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return undefined;
  const d = new Date();
  if (value.includes('year')) d.setFullYear(d.getFullYear() - n);
  else if (value.includes('month')) d.setMonth(d.getMonth() - n);
  else if (value.includes('week')) d.setDate(d.getDate() - n * 7);
  else if (value.includes('day')) d.setDate(d.getDate() - n);
  else if (value.includes('hour')) d.setHours(d.getHours() - n);
  else if (value.includes('min')) d.setMinutes(d.getMinutes() - n);
  else if (value.includes('sec')) d.setSeconds(d.getSeconds() - n);
  else return undefined;
  return d.getTime();
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`/manga/${paged(page)}?orderby=views`),
    getLatest: (page) => list(`/manga/${paged(page)}?orderby=modified`),
    search: (query, page) =>
      query.trim()
        ? list(`/${paged(page)}?s=${encodeURIComponent(query.trim())}&post_type=manga`)
        : list(`/manga/${paged(page)}?orderby=views`),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      return {
        url: manga.url,
        title: document.selectFirst('.manga-title')?.text() || manga.title,
        author: document.selectFirst('.author-line')?.text().split('Author:')[1]?.trim() || undefined,
        description: document.selectFirst('.summary-content')?.text() || undefined,
        genres: document.select('.genre-tag').map((e) => e.text()),
        thumbnailUrl: document.selectFirst('.manga-cover-img')?.absUrl('src') || manga.thumbnailUrl,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      return (await load(manga.url)).select('.chapters-list .chapter-item').map((item) => ({
        url: relativeUrl(item.absUrl('href') || item.attr('href') || ''),
        name: item.selectFirst('.chapter-title')?.text() ?? '',
        uploadedAt: relativeDate(item.selectFirst('.chapter-date')?.text() ?? ''),
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      return (await load(chapter.url))
        .select('.reader-page img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.absUrl('data-src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/manga\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/manga/${match[2]}/`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
