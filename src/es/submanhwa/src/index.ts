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

const BASE_URL = 'https://submanhwa.com';
const headers = {
  'User-Agent': USER_AGENT,
  Referer: `${BASE_URL}/`,
  'Accept-Language': 'es-PE,es;q=0.9,en-US;q=0.8,en;q=0.7',
};

const STATUS: Record<string, MangaStatus> = { completa: 'completed', 'en curso': 'ongoing' };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const path = (element: HtmlElement | null | undefined) =>
  relativeUrl(element?.absUrl('href') || element?.attr('href') || '');

async function filterList(page: number, alpha?: string): Promise<MangaPage> {
  const document = await load(
    `${BASE_URL}/filterList?page=${page}&sortBy=views&asc=false${alpha === undefined ? '' : `&alpha=${encodeURIComponent(alpha)}`}`,
  );
  const items = document.select('.series-card').flatMap((element): MangaSummary[] => {
    const title = element.selectFirst('.series-title')?.text();
    const link = element.selectFirst('a');
    if (!title || !link) return [];
    return [{ url: path(link), title, thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined }];
  });
  return { items, hasNextPage: !!document.selectFirst('li a[rel=next]') };
}

const imgAttr = (img: HtmlElement) => (img.attr('data-src') !== undefined ? img.absUrl('data-src') : img.absUrl('src'));

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => filterList(page),
    async getLatest(): Promise<MangaPage> {
      const document = await load(BASE_URL);
      const items = document.select('div[class^=manga-item]').flatMap((element): MangaSummary[] => {
        const title = element.selectFirst('h3[class^=manga-title] a')?.text();
        const link = element.selectFirst('a');
        if (!title || !link) return [];
        return [{ url: path(link), title, thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined }];
      });
      return { items, hasNextPage: false };
    },
    search: (query, page) => filterList(page, query),
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(`${BASE_URL}${manga.url}`);
      const box = document.selectFirst('.main-content > .boxed-modern');
      // A detail row is a ".detail-label" followed by its ".detail-value".
      const labels = box?.select('.detail-label') ?? [];
      const values = box?.select('.detail-label + .detail-value') ?? [];
      const row = (label: string) => {
        const i = labels.findIndex((l) => l.text().toLowerCase().includes(label));
        return i >= 0 ? values[i] : undefined;
      };
      const status = row('estado')?.selectFirst('span')?.text().toLowerCase();
      return {
        url: manga.url,
        title: document.selectFirst('.manga-title-centered')?.text() ?? manga.title,
        thumbnailUrl: document.selectFirst('img')?.absUrl('src') || undefined,
        description: document.selectFirst('h5 + p')?.text() || undefined,
        status: STATUS[status ?? ''] ?? 'unknown',
        author: row('autor')?.selectFirst('a')?.text(),
        artist: row('artist')?.selectFirst('a')?.text(),
        genres: row('categor')
          ?.select('a')
          .map((a) => a.text()),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(`${BASE_URL}${manga.url}`);
      return document.select('.chapters-grid [class^=chapter-card]').flatMap((element): Chapter[] => {
        const a = element.selectFirst('a.chapter-link');
        if (!a) return [];
        const date =
          element
            .select('span')
            .find((s) => s.selectFirst('i.glyphicon-time'))
            ?.text() ?? element.selectFirst('.chapter-preview-meta > span')?.text();
        return [{ url: path(a), name: a.text(), uploadedAt: parseDate(date, 'd MMM. yyyy') }];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(`${BASE_URL}${chapter.url}`);
      return document.select('#all img').map((img, index) => ({ index, imageUrl: imgAttr(img) }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
    resolveUrl(url): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?submanhwa\.com(\/serie\/[^/?#]+)/i.exec(url);
      return match ? { url: match[1]!, title: '' } : null;
    },
  }),
});
