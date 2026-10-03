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
import { USER_AGENT, hostOf, parseDate, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://ryukomik.my.id';
const API_URL = 'https://api.ryukomik.web.id';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

// An aggregator: manga urls are "/komik/<source>/<slug>".

interface ItemDto {
  title?: string | null;
  slug?: string | null;
  detail_link?: string | null;
  link?: string | null;
  image?: string | null;
  cover_url?: string | null;
  source?: string | null;
}

interface ListResponse {
  data?: ItemDto[];
  meta?: { currentPage?: number; totalPages?: number } | null;
}

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

async function api<T>(url: string): Promise<T> {
  return (await http.get<T>(url, { headers, responseType: 'json' })).body;
}

const lastSegment = (url: string | null | undefined) => url?.replace(/\/+$/, '').split('/').pop() || undefined;

function toSummary(item: ItemDto, defaultSource: string): MangaSummary | null {
  const slug = item.slug?.trim() || lastSegment(item.detail_link) || lastSegment(item.link);
  if (!slug || !item.title?.trim()) return null;
  return {
    url: `/komik/${item.source?.trim() || defaultSource}/${slug}`,
    title: item.title,
    thumbnailUrl: item.image || item.cover_url || undefined,
  };
}

async function list(params: Record<string, string | undefined>): Promise<MangaPage> {
  const response = await api<ListResponse>(withQuery(`${API_URL}/komiku/list`, params));
  const items = (response.data ?? []).map((i) => toSummary(i, 'komiku')).filter((m): m is MangaSummary => m !== null);
  return {
    items,
    hasNextPage: response.meta ? (response.meta.currentPage ?? 1) < (response.meta.totalPages ?? 1) : false,
  };
}

function coverCards(document: HtmlElement): MangaSummary[] {
  const seen = new Set<string>();
  return document.select("a.rk-cover-card[href^='/komik/']").flatMap((card): MangaSummary[] => {
    const href = relativeUrl(card.attr('href') ?? '');
    const img = card.selectFirst('img');
    const title = img?.attr('alt')?.trim() || card.selectFirst('p')?.text();
    if (!href || !title || seen.has(href)) return [];
    seen.add(href);
    return [{ url: href, title, thumbnailUrl: img?.absUrl('src') || undefined }];
  });
}

function parseRelative(text: string): number | undefined {
  const value = text.trim().toLowerCase();
  const units: [string, (d: Date, n: number) => void][] = [
    ['detik', (d, n) => d.setSeconds(d.getSeconds() - n)],
    ['menit', (d, n) => d.setMinutes(d.getMinutes() - n)],
    ['jam', (d, n) => d.setHours(d.getHours() - n)],
    ['hari', (d, n) => d.setDate(d.getDate() - n)],
    ['minggu', (d, n) => d.setDate(d.getDate() - n * 7)],
    ['bulan', (d, n) => d.setMonth(d.getMonth() - n)],
    ['tahun', (d, n) => d.setFullYear(d.getFullYear() - n)],
  ];
  for (const [word, apply] of units) {
    if (!value.includes(word)) continue;
    const amount = Number.parseInt(value.split(word)[0]!.trim(), 10);
    const date = new Date();
    apply(date, Number.isNaN(amount) ? 1 : amount);
    return date.getTime();
  }
  return value.includes('/') ? parseDate(value, 'dd/MM/yyyy') : undefined;
}

const STATUSES: Record<string, MangaStatus> = {
  ongoing: 'ongoing',
  berjalan: 'ongoing',
  completed: 'completed',
  tamat: 'completed',
  complete: 'completed',
  hiatus: 'hiatus',
  dropped: 'cancelled',
};

const option = (label: string, value: string) => ({ label, value });
const GENRES = [
  'action', 'adventure', "boys'-love", 'comedy', 'crime', 'drama', 'ecchi', 'fantasy', "girls'-love", 'harem',
  'historical', 'horror', 'isekai', 'josei', 'magical-girls', 'martial-arts', 'mecha', 'medical', 'music', 'mystery',
  'philosophical', 'psychological', 'romance', 'school-life', 'sci-fi', 'seinen', 'shoujo', 'shoujo-ai', 'shounen',
  'shounen-ai', 'slice-of-life', 'sports', 'superhero', 'supernatural', 'thriller', 'tragedy', 'wuxia', 'yuri',
]; // prettier-ignore
const label = (slug: string) =>
  slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    getPopular: (page) => list({ page: String(page) }),

    async getLatest(): Promise<MangaPage> {
      return { items: coverCards(await fetchDocument(BASE_URL)), hasNextPage: false };
    },

    async search(query: string, page: number, state: FilterState): Promise<MangaPage> {
      const text = (id: string) => (typeof state[id] === 'string' && state[id] ? (state[id] as string) : undefined);
      if (query.trim()) {
        // Every source is searched; the results are merged.
        const sources = ['project', 'komiku', 'kiryuu', 'komikid', 'josei'];
        const results = await Promise.all(
          sources.map(async (source) => {
            const url = source === 'project' ? `${BASE_URL}/api/project/search` : `${API_URL}/${source}/search`;
            try {
              const response = await api<ListResponse>(withQuery(url, { q: query.trim() }));
              return (response.data ?? [])
                .map((i) => toSummary(i, source))
                .filter((m): m is MangaSummary => m !== null);
            } catch {
              return [];
            }
          }),
        );
        const seen = new Set<string>();
        return {
          items: results.flat().filter((m) => !seen.has(m.url) && Boolean(seen.add(m.url))),
          hasNextPage: false,
        };
      }
      const genre = text('genre');
      if (genre) {
        if (page > 1) return { items: [], hasNextPage: false };
        return { items: coverCards(await fetchDocument(`${BASE_URL}/genre/${genre}`)), hasNextPage: false };
      }
      return list({
        page: String(page),
        tipe: text('type'),
        orderby: text('order'),
        huruf: text('letter'),
        status: text('status'),
      });
    },

    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'type',
        label: 'Tipe',
        options: [
          option('Semua', ''),
          option('Manga', 'manga'),
          option('Manhwa', 'manhwa'),
          option('Manhua', 'manhua'),
        ],
      },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [option('Semua', ''), option('Ongoing (Berjalan)', 'ongoing'), option('Completed (Tamat)', 'end')],
      },
      {
        type: 'select',
        id: 'order',
        label: 'Urutkan',
        options: [
          option('Default', ''),
          option('Chapter Terbaru', 'modified'),
          option('Komik Terbaru', 'date'),
          option('Acak', 'rand'),
        ],
      },
      {
        type: 'select',
        id: 'letter',
        label: 'Huruf',
        options: [
          option('Semua', ''),
          option('#', '#'),
          ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => option(c, c)),
        ],
      },
      { type: 'separator' },
      {
        type: 'select',
        id: 'genre',
        label: 'Genre',
        options: [option('Semua', ''), ...GENRES.map((g) => option(label(g), g))],
      },
    ],

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}`);
      const genres: string[] = [];
      const chip = document.selectFirst('span.rk-chip')?.text();
      if (chip) genres.push(chip);
      for (const a of document.select("a[href*='/genre/']"))
        if (a.text() && !genres.includes(a.text())) genres.push(a.text());
      const author = document.selectFirst('div.rk-shell span.text-white\\/60.truncate')?.text();
      const status = document.selectFirst('div.rk-shell div.flex.gap-3 span:last-child')?.text().toLowerCase() ?? '';
      return {
        url: manga.url,
        title: document.selectFirst('h1')?.text() || manga.title,
        thumbnailUrl:
          document.selectFirst('div.rk-shell img[alt=Poster], div.rk-shell div.flex-shrink-0 img')?.absUrl('src') ||
          manga.thumbnailUrl,
        author: author && author !== '-' ? author : undefined,
        genres,
        description: document.selectFirst('p.text-sm.leading-relaxed.text-white\\/70')?.text() || undefined,
        status: STATUSES[status] ?? 'unknown',
      };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}`);
      return document.select("a[href*='/chapter/']").map((a) => {
        const date = a.selectFirst('span.text-\\[11px\\] > span:first-child')?.text();
        return {
          url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
          name:
            a.selectFirst('span.text-\\[13px\\], span.font-medium')?.text() ||
            a.selectFirst('div > div > span')?.text() ||
            a.text(),
          uploadedAt: date ? parseRelative(date) : undefined,
        };
      });
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const body = (await http.get(`${BASE_URL}${chapter.url}`, { headers })).body;
      const match = /\\?"images\\?"\s*:\s*(\[[^\]]+\])/.exec(body)?.[1];
      if (!match) return [];
      const images = JSON.parse(match.replace(/\\"/g, '"').replace(/\\\\/g, '\\')) as string[];
      return images.map((url, index) => ({
        index,
        imageUrl: /^https?:\/\//.test(url) ? url : `${BASE_URL}/${url.replace(/^\/+/, '')}`,
      }));
    },

    imageHeaders: () => headers,

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/komik\/[^/?#]+\/[^/?#]+)/i.exec(url.trim());
      return match && match[1]?.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
