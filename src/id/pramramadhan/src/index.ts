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
import { USER_AGENT, parseDate, relativeUrl, selectFirstIgnoreCase, withQuery } from './common/utils';

const BASE_URL = 'https://01.pramramadhan.my.id';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

// The search page has no pagination: page 1 is everything.
async function searchPage(page: number, params: Record<string, string | undefined>): Promise<MangaPage> {
  if (page > 1) return { items: [], hasNextPage: false };
  const document = await fetchDocument(withQuery(`${BASE_URL}/search.php`, { ...params, page: String(page) }));
  const items = document.select('a.result-card').flatMap((element): MangaSummary[] => {
    const title = element.selectFirst('div.result-title')?.text();
    if (!title) return [];
    return [
      {
        url: relativeUrl(element.absUrl('href') || element.attr('href') || ''),
        title,
        thumbnailUrl: element.selectFirst('div.result-cover img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: false };
}

function parseChapterDate(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const [amountText, unit] = text.toLowerCase().trim().replace(/lalu$/, '').trim().split(' ');
  const amount = Number.parseInt(amountText ?? '', 10);
  if (!Number.isNaN(amount) && unit) {
    const date = new Date();
    const units: Record<string, () => void> = {
      detik: () => date.setUTCSeconds(date.getUTCSeconds() - amount),
      menit: () => date.setUTCMinutes(date.getUTCMinutes() - amount),
      jam: () => date.setUTCHours(date.getUTCHours() - amount),
      hari: () => date.setUTCDate(date.getUTCDate() - amount),
      minggu: () => date.setUTCDate(date.getUTCDate() - amount * 7),
      bulan: () => date.setUTCMonth(date.getUTCMonth() - amount),
      tahun: () => date.setUTCFullYear(date.getUTCFullYear() - amount),
    };
    if (units[unit]) {
      units[unit]!();
      return date.getTime();
    }
  }
  return parseDate(text, 'd MMMM yyyy');
}

const option = (label: string, value: string) => ({ label, value });
const select = (id: string, label: string, values: [string, string][]): Filter => ({
  type: 'select',
  id,
  label,
  options: values.map(([l, v]) => option(l, v)),
});

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    getPopular: (page) => searchPage(page, { sort: 'popular' }),

    getLatest: (page) => searchPage(page, { sort: 'newest' }),

    search(query: string, page: number, state: FilterState): Promise<MangaPage> {
      const text = (id: string) =>
        typeof state[id] === 'string' && (state[id] as string).trim() ? (state[id] as string).trim() : undefined;
      return searchPage(page, {
        q: query.trim() || undefined,
        sort: text('sort') ?? 'popular',
        genre: text('genre'),
        type: text('type'),
        project: text('project'),
        status: text('status'),
        author: text('author'),
        artist: text('artist'),
      });
    },

    getFilters: (): Filter[] => [
      select('sort', 'Urutkan', [
        ['Populer', 'popular'],
        ['Terbaru', 'newest'],
        ['Terlama', 'oldest'],
        ['Judul A-Z', 'title_asc'],
        ['Judul Z-A', 'title_desc'],
      ]),
      select('genre', 'Genre', [
        ['Semua', ''],
        ...['Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Magic', 'Romance', 'School', 'Slice of Life'].map(
          (g): [string, string] => [g, g],
        ),
      ]),
      select('type', 'Format', [
        ['Semua', ''],
        ['Light Novel', 'Light Novel'],
        ['Manga', 'Manga'],
        ['Web Novel', 'Web Novel'],
      ]),
      select('project', 'Project', [
        ['Semua', ''],
        ['Continued', 'continued'],
        ['Completed', 'completed'],
        ['Dropped', 'dropped'],
      ]),
      select('status', 'Status', [
        ['Semua', ''],
        ['Ongoing', 'ongoing'],
        ['Completed', 'completed'],
      ]),
      { type: 'text', id: 'author', label: 'Author' },
      { type: 'text', id: 'artist', label: 'Artist' },
    ],

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}`);
      const tag = (label: string) =>
        selectFirstIgnoreCase(document, `.tag-row:has(.tag-label:contains(${label})) .tag-pill`)?.text();
      const status = tag('Status')?.toLowerCase();
      const statuses: Record<string, MangaStatus> = { ongoing: 'ongoing', completed: 'completed' };
      return {
        url: manga.url,
        title: document.selectFirst('h1.series-title')?.text() || manga.title,
        author: tag('Author') || undefined,
        artist: tag('Artist') || undefined,
        genres: document.select('.tag-row:has(.tag-label:contains(Genre)) .tag-list a.tag-pill').map((a) => a.text()),
        status: statuses[status ?? ''] ?? 'unknown',
        description: document.selectFirst('p.series-desc')?.text() || undefined,
        thumbnailUrl: document.selectFirst('div.series-cover img')?.absUrl('src') || manga.thumbnailUrl,
      };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}`);
      return document.select('div.chapter-grid a.chapter-card').flatMap((element): Chapter[] => {
        const title = element.selectFirst('div.chapter-title')?.text();
        if (!title) return [];
        const sub = element.selectFirst('div.chapter-sub')?.text();
        return [
          {
            url: relativeUrl(element.absUrl('href') || element.attr('href') || ''),
            name: sub ? `${title} - ${sub}` : title,
            uploadedAt: parseChapterDate(element.selectFirst('div.chapter-time')?.text()),
          },
        ];
      });
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await fetchDocument(`${BASE_URL}${chapter.url}`);
      return document
        .select('div.reader-container img.page')
        .map((img) => img.absUrl('src') || img.attr('src') || '')
        .filter(Boolean)
        .map((imageUrl, index) => ({ index, imageUrl }));
    },

    imageHeaders: () => headers,

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:01\.)?pramramadhan\.my\.id\/series\/([^/?#]+)/i.exec(url.trim());
      return match ? { url: `/series/${match[1]}`, title: '' } : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
