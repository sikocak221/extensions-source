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
import { USER_AGENT, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://scantrad-union.com';
const SEARCH_URL_SUFFIX_DATA = 'YXNwX2dlbiU1QiU1RD10aXRsZSZjdXN0b21zZXQlNUIlNUQ9bWFuZ2E=';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const STATUS: Record<string, MangaStatus> = { 'en cours': 'ongoing', terminé: 'completed' };

const formatMangaTitle = (value: string) => value.replace(/^\[Partenaire\]/, '').trim();
const formatMangaNumber = (value: string) => value.replace(/^#/, '').trim();

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const path = (url: string | undefined) => relativeUrl(url ?? '');

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const document = await load(`${BASE_URL}/projets/`);
      const items = document.select('.index-top3-a').map((element): MangaSummary => ({
        title: formatMangaTitle(element.selectFirst('.index-top3-title')?.text() ?? ''),
        url: path(element.attr('href')),
        thumbnailUrl:
          (element.selectFirst('.index-top3-bg')?.attr('style') ?? '').split("background:url('")[1]?.split("')")[0] ||
          undefined,
      }));
      const seen = new Set<string>();
      return { items: items.filter((m) => !seen.has(m.url) && seen.add(m.url)), hasNextPage: false };
    },
    async getLatest(): Promise<MangaPage> {
      const document = await load(BASE_URL);
      const seen = new Set<string>();
      const items = document.select('.dernieresmaj .colonne').flatMap((element): MangaSummary[] => {
        const link = element.selectFirst('a.text-truncate');
        if (!link || seen.has(path(link.attr('href')))) return [];
        seen.add(path(link.attr('href')));
        return [
          {
            title: formatMangaTitle(link.text()),
            url: path(link.attr('href')),
            thumbnailUrl: element.selectFirst('img.attachment-thumbnail')?.attr('src') || undefined,
          },
        ];
      });
      return { items, hasNextPage: false };
    },
    async search(query): Promise<MangaPage> {
      const url = `${BASE_URL}/?s=${encodeURIComponent(query)}&asp_active=1&p_asid=1&p_asp_data=${encodeURIComponent(SEARCH_URL_SUFFIX_DATA)}`;
      const document = await load(url);
      const items = document.select('article.post-outer').flatMap((element): MangaSummary[] => {
        const link = element.selectFirst('a.index-post-header-a');
        if (!link) return [];
        return [
          {
            title: formatMangaTitle(link.text()),
            url: path(link.attr('href')),
            thumbnailUrl: element.selectFirst('img.wp-post-image')?.attr('src') || undefined,
          },
        ];
      });
      return { items, hasNextPage: false };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(`${BASE_URL}${manga.url}`);
      const author = document
        .select('div.project-details a[href*=auteur]')
        .map((a) => a.text())
        .join(', ');
      return {
        url: manga.url,
        title: formatMangaTitle(document.selectFirst('.projet-description h2')?.text() ?? '') || manga.title,
        thumbnailUrl: document.selectFirst('.projet-image img')?.attr('src') || manga.thumbnailUrl,
        description: document.selectFirst('.sContent')?.text() || undefined,
        author: author || undefined,
        artist: author || undefined,
        status: STATUS[(document.select('.label.label-primary')[2]?.text() ?? '').trim().toLowerCase()] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(`${BASE_URL}${manga.url}`);
      return document.select('.links-projects li').map((element): Chapter => {
        const number = formatMangaNumber(element.selectFirst('.chapter-number')?.text() ?? '');
        const chapterName = element.selectFirst('.chapter-name')?.text() ?? '';
        const buttons = element.select('.btnlel').map((b) => b.attr('href') ?? '');
        const url = buttons.find((href) => href.startsWith(`${BASE_URL}/read/`)) ?? buttons[0] ?? '';
        const date = element.select('.name-chapter > *')[2]?.text() ?? '';
        return {
          url: path(url),
          name: [number, chapterName].filter((s) => s.trim()).join(' - '),
          scanlator:
            element
              .select('.btnteam')
              .map((t) => t.text())
              .join(' ') || undefined,
          uploadedAt: parseDate(date, 'd-M-yyyy'),
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(`${BASE_URL}${chapter.url}`);
      const urls = document.select('#webtoon a img').map((img) => {
        const lazy = img.attr('data-src');
        return lazy?.trim() ? lazy : (img.attr('src') ?? '');
      });
      return [...new Set(urls)].map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
    resolveUrl(url): MangaSummary | null {
      const segments = url
        .replace(/^https?:\/\/[^/]+/i, '')
        .replace(/[?#].*$/, '')
        .split('/')
        .filter(Boolean);
      if (!/^https?:\/\/(?:www\.)?scantrad-union\.com/i.test(url)) return null;
      if (segments[0] === 'manga' || segments[0] === 'projets') return { url: `/${segments.join('/')}/`, title: '' };
      return null;
    },
  }),
});
