import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, withQuery } from './common/utils';

const BASE_URL = 'https://holodek.run';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

/** Path without query/fragment and trailing slash; old "/komik/" urls map to "/comic/". */
function mangaPath(url: string): string {
  const path = url.replace(/^https?:\/\/[^/]+/i, '').replace(/[?#].*$/, '');
  const withSlash = path.startsWith('/') ? path : `/${path}`;
  return withSlash.replace(/^\/komik\//, '/comic/').replace(/\/+$/, '');
}

async function browse(page: number, params: Record<string, string>): Promise<MangaPage> {
  const url = withQuery(`${BASE_URL}/browse`, {
    sort: params.sort || 'latest',
    media: 'comic',
    q: params.q || undefined,
    type: params.type || undefined,
    status: params.status || undefined,
    genre: params.genre || undefined,
    page: page > 1 ? String(page) : undefined,
  });
  const document = await fetchDocument(url);
  // The site has scraper honeypots: only the real catalogue grid (the last one) counts.
  const grids = document.select("div.grid:has(a[href^='/comic/'])");
  const grid = grids[grids.length - 1];
  if (!grid) return { items: [], hasNextPage: false };
  const seen = new Set<string>();
  const items = grid.select("a.group[href^='/comic/']").flatMap((card): MangaSummary[] => {
    const path = mangaPath(card.attr('href') ?? '');
    const title = card.selectFirst('h3')?.text();
    if (!/^\/comic\/[^/]+/.test(path) || !title || seen.has(path)) return [];
    seen.add(path);
    return [{ url: path, title, thumbnailUrl: card.selectFirst('img')?.absUrl('src') || undefined }];
  });
  const hasNextPage = document
    .select("a[href*='page=']")
    .some((a) => (a.attr('href') ?? '').includes(`page=${page + 1}`));
  return { items, hasNextPage };
}

function parseRelative(text: string | undefined): number | undefined {
  const value = text?.trim().toLowerCase();
  if (!value) return undefined;
  if (value === 'baru saja' || value === 'just now') return Date.now();
  const amount = Number.parseInt(/\d+/.exec(value)?.[0] ?? '', 10);
  if (Number.isNaN(amount)) return undefined;
  const date = new Date();
  const has = (...words: string[]) => words.some((w) => value.includes(w));
  if (has('detik', 'second')) date.setSeconds(date.getSeconds() - amount);
  else if (has('menit', 'minute')) date.setMinutes(date.getMinutes() - amount);
  else if (has('jam', 'hour')) date.setHours(date.getHours() - amount);
  else if (has('hari', 'day')) date.setDate(date.getDate() - amount);
  else if (has('minggu', 'week')) date.setDate(date.getDate() - amount * 7);
  else if (has('bulan', 'month')) date.setMonth(date.getMonth() - amount);
  else if (has('tahun', 'year')) date.setFullYear(date.getFullYear() - amount);
  else return undefined;
  return date.getTime();
}

const option = (label: string, value: string) => ({ label, value });
const STATUSES: Record<string, MangaStatus> = {
  ongoing: 'ongoing',
  completed: 'completed',
  hiatus: 'hiatus',
  dropped: 'cancelled',
};

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    getPopular: (page) => browse(page, { sort: 'popular' }),

    getLatest: (page) => browse(page, { sort: 'latest' }),

    search(query: string, page: number, state: FilterState): Promise<MangaPage> {
      const text = (id: string) => (typeof state[id] === 'string' ? (state[id] as string) : '');
      return browse(page, {
        sort: text('sort'),
        q: query.trim(),
        type: text('type'),
        status: text('status'),
        genre: text('genre'),
      });
    },

    async getFilters(): Promise<Filter[]> {
      const filters: Filter[] = [
        {
          type: 'select',
          id: 'sort',
          label: 'Urutkan',
          options: [
            option('Terbaru', 'latest'),
            option('Populer', 'popular'),
            option('Rating', 'rating'),
            option('A-Z', 'az'),
          ],
        },
        {
          type: 'select',
          id: 'type',
          label: 'Tipe',
          options: [
            option('Semua', ''),
            ...['Manga', 'Manhwa', 'Manhua', 'Comic', 'Webtoon'].map((t) => option(t, t.toLowerCase())),
          ],
        },
        {
          type: 'select',
          id: 'status',
          label: 'Status',
          options: [option('Semua', ''), ...['Ongoing', 'Completed', 'Hiatus'].map((s) => option(s, s.toLowerCase()))],
        },
      ];
      try {
        const document = await fetchDocument(`${BASE_URL}/browse`);
        const genres = document
          .select('select[name=genre] option')
          .map((o) => option(o.text(), o.attr('value')?.trim() ?? ''))
          .filter((o) => o.label && o.value);
        if (genres.length > 0)
          filters.push({ type: 'select', id: 'genre', label: 'Genre', options: [option('Semua', ''), ...genres] });
      } catch (error) {
        log.warn('Cannot load genres', error);
      }
      return filters;
    },

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const path = mangaPath(manga.url);
      const document = await fetchDocument(`${BASE_URL}${path}`);
      const title = document.selectFirst('h1')?.text() ?? manga.title;
      // The details block is the nearest ancestor of the title holding the genre links.
      const root =
        document.selectFirst("div:has(> h1):has(a[href*='genre='])") ??
        document.selectFirst("div:has(h1):has(a[href*='genre=']):not(:has(div:has(h1):has(a[href*='genre='])))") ??
        document;
      const metadata = root.text();
      const descriptionElement = document.selectFirst(
        '#synopsis-wrapper div[data-sr], div[data-sr][class*=synopsis], div.prose, div[class*=description]',
      );
      let description: string | undefined;
      const encoded = descriptionElement?.attr('data-sr');
      if (encoded) {
        try {
          description = base64.decode(encoded) || undefined;
        } catch {
          description = undefined;
        }
      }
      description ??= descriptionElement?.text() || undefined;
      const status = root
        .select('span')
        .map((s) => s.text().trim().toLowerCase())
        .find((s) => s in STATUSES);
      const cover = document
        .select('img')
        .find((img) => (img.attr('alt') ?? '').trim().toLowerCase() === title.toLowerCase());
      return {
        url: path,
        title,
        author: /Author:\s*(.*?)\s+Artist:/i.exec(metadata)?.[1]?.trim() || undefined,
        artist: /Artist:\s*(.*?)\s+(?:Year:|Views:|Uploaded by:)/i.exec(metadata)?.[1]?.trim() || undefined,
        genres: [
          ...new Set(
            root
              .select("a[href*='genre=']")
              .map((a) => a.text())
              .filter(Boolean),
          ),
        ],
        description,
        status: status ? STATUSES[status]! : 'unknown',
        thumbnailUrl: cover?.absUrl('src') || manga.thumbnailUrl,
      };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await fetchDocument(`${BASE_URL}${mangaPath(manga.url)}`);
      return document.select("a[href^='/read/'][data-chapter]").flatMap((element): Chapter[] => {
        const path = (element.attr('href') ?? '').replace(/[?#].*$/, '');
        if (!path) return [];
        const raw = element.attr('data-chapter') ?? '';
        const number = Number.parseFloat(/\d+(?:\.\d+)?/.exec(raw)?.[0] ?? '');
        const label = element.selectFirst('span.font-semibold')?.text();
        const subtitle = element.selectFirst('span.truncate')?.text().replace(/^—/, '').trim() || undefined;
        const name =
          label && subtitle
            ? `${label} - ${subtitle}`
            : label || subtitle || (Number.isFinite(number) ? `Chapter ${number}` : raw || 'Chapter');
        return [
          {
            url: path.replace(/\/+$/, ''),
            name,
            number: Number.isFinite(number) ? number : undefined,
            uploadedAt: parseRelative(
              element.selectFirst('span.text-right, span[class*=tabular-nums]:last-child')?.text(),
            ),
          },
        ];
      });
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await fetchDocument(`${BASE_URL}${chapter.url}`);
      let images = document.select('#reader-pages img');
      if (images.length === 0)
        images = document.select("main img[src*='/image/comic/'], main img[data-src*='/image/comic/']");
      const seen = new Set<string>();
      const urls: string[] = [];
      for (const img of images) {
        const url = img.absUrl('src') || img.absUrl('data-src') || '';
        if (!url || url.includes('/chapter-header/') || url.includes('/chapter-footer/') || seen.has(url)) continue;
        seen.add(url);
        urls.push(url);
      }
      return urls.map((imageUrl, index) => ({ index, imageUrl }));
    },

    imageHeaders: () => headers,

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/(?:comic|komik)\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]?.toLowerCase() === hostOf(BASE_URL) ? { url: `/comic/${match[2]}`, title: '' } : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
