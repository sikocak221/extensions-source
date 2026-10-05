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
import { USER_AGENT, ownText, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://dassouscan.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const HIDE_PREMIUM_PREFERENCE: Preference = {
  type: 'switch',
  key: 'pref_hide_premium',
  label: 'Masquer les chapitres premium',
  description: 'Masquer les chapitres verrouillés en accès anticipé payant',
  default: true,
};

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function parseCatalogue(document: HtmlElement): MangaPage {
  const items = document.select('article.dsc-cat-card').map((element): MangaSummary => {
    const title = element.attr('data-title') || element.selectFirst('.dsc-cat-card__title a')?.text() || '';
    if (!title) throw new Error('Title is empty');
    const link = element.selectFirst('a.dsc-cat-card__cover-link, .dsc-cat-card__title a, a.dsc-cat-card__open');
    return {
      url: relativeUrl(link?.absUrl('href') || link?.attr('href') || ''),
      title,
      thumbnailUrl: element.selectFirst('.dsc-cat-card__cover img')?.absUrl('src') || undefined,
    };
  });
  const hasNextPage = document.select('a.dsc-cat__pager-btn[href]').some((a) => a.text().includes('Suivant'));
  return { items, hasNextPage };
}

const catalogue = async (params: string, page: number) =>
  parseCatalogue(await load(`${BASE_URL}/catalogue?${params}${page > 1 ? `&page=${page}` : ''}`));

function parseDetails(document: HtmlElement, url: string): MangaDetails {
  const title = document.selectFirst('h1')?.text();
  if (!title) throw new Error('Manga title is missing');
  return {
    url,
    title,
    description: document.selectFirst('.dsc-mf__synopsis-text')?.text() || undefined,
    genres: document.select('.dsc-mf__tags a.dsc-mf__tag').map((a) => a.text()),
    thumbnailUrl: document.selectFirst('.dsc-mf__cover img')?.absUrl('src') || undefined,
    status: 'unknown',
  };
}

function parseChapterList(document: HtmlElement): Chapter[] {
  const hidePremium = prefs.get<boolean>(HIDE_PREMIUM_PREFERENCE.key) ?? true;
  const chapters: Chapter[] = [];
  for (const element of document.select('div.dsc-manga-chapter-block:not(:has(a[href*=/inscription/]))')) {
    const isPremium =
      (element.attr('class') ?? '').split(/\s+/).includes('chapter--locked') ||
      !!element.selectFirst('.dsc-ch-hl__access--premium, a.is-locked');
    if (isPremium && hidePremium) continue;
    const link = element.selectFirst('a.dsc-manga-chapter-block__title-link');
    if (!link) continue;
    const name = ownText(element.selectFirst('.chapter-title')) || link.text();
    const dateText = element.selectFirst('.chapter-info')?.text() ?? '';
    chapters.push({
      url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
      name: `${isPremium ? '🔒 ' : ''}${name}`,
      uploadedAt: parseDate(dateText, dateText.includes('à') ? "d MMMM yyyy 'à' HH:mm" : 'dd/MM/yyyy'),
    });
  }
  return chapters.reverse();
}

export default defineExtension({
  preferences: () => [HIDE_PREMIUM_PREFERENCE],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => catalogue('tri=popular', page),
    getLatest: (page) => catalogue('tri=latest', page),
    search: (query, page) => catalogue(`q=${encodeURIComponent(query)}`, page),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      return parseDetails(await load(`${BASE_URL}${manga.url}`), manga.url);
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      return parseChapterList(await load(`${BASE_URL}${manga.url}`));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(`${BASE_URL}${chapter.url}`);
      return document.select('#dsc-chapter-reader-content .dsc-chapter-strip-img').map((img, index) => ({
        index,
        imageUrl: img.absUrl('data-src') || img.absUrl('src'),
      }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
    resolveUrl(url): MangaSummary | null {
      const match = /^https?:\/\/dassouscan\.com(\/manga\/[^/?#]+)\/?$/i.exec(url);
      return match ? { url: match[1]!, title: '' } : null;
    },
  }),
});
