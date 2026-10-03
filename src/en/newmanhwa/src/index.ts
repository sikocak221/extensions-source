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
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://saymanhwa.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const SORTS: [string, string][] = [
  ['Updated', 'updated'],
  ['Popular', 'popular'],
  ['Most Chapters', 'chapters'],
  ['Newest', 'newest'],
  ['A-Z', 'az'],
  ['Z-A', 'za'],
];

async function load(url: string) {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return { url: response.url, document: html.load(response.body, { baseUrl: response.url }) };
}

function cards(document: HtmlElement): MangaPage {
  const items = document.select('article.series-card').flatMap((card): MangaSummary[] => {
    const cover = card.selectFirst('a.series-card-cover');
    if (!cover) return [];
    const img = cover.selectFirst('img');
    return [
      {
        url: relativeUrl(cover.absUrl('href') || cover.attr('href') || ''),
        title: (card.selectFirst('div.series-card-body h2 a')?.text() ?? '').replace(/^#\d+\s+/, '').trim(),
        thumbnailUrl: img?.absUrl('data-src') || img?.absUrl('src') || undefined,
      },
    ];
  });
  return {
    items,
    hasNextPage: document
      .select('a')
      .some((a) => a.text().includes('Next') && !(a.attr('class') ?? '').includes('disabled')),
  };
}

function details(document: HtmlElement, url: string): MangaDetails {
  const meta = (label: string) =>
    document
      .select('aside.series-v72-sidebar .series-v72-meta')
      .find((m) => m.selectFirst('span')?.text().toLowerCase() === label.toLowerCase())
      ?.selectFirst('strong')
      ?.text();
  const statuses: Record<string, MangaStatus> = { ongoing: 'ongoing', completed: 'completed', hiatus: 'hiatus' };
  let genres = document.select('div.series-v72-genres a').map((a) => a.text());
  if (!genres.length) {
    const ld = document
      .select('script[type="application/ld+json"]')
      .map((s) => s.html())
      .find((s) => s.includes('"@type":"ComicSeries"'));
    genres = (/"genre":\s*\[(.*?)\]/.exec(ld ?? '')?.[1] ?? '')
      .replace(/"/g, '')
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);
  }
  return {
    url,
    title: document.selectFirst('h1')?.text() ?? '',
    description:
      document
        .selectFirst('div.series-v72-description')
        ?.text()
        .split(/\s*\bTags\b\s*/)[0]
        ?.trim() || undefined,
    author: meta('Author'),
    artist: meta('Artist'),
    status: statuses[meta('Status')?.toLowerCase() ?? ''] ?? 'unknown',
    thumbnailUrl: document.selectFirst('aside.series-left .cover-card img')?.absUrl('src') || undefined,
    genres,
  };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => cards((await load(`/popular?page=${page}`)).document),
    getLatest: async (page) => cards((await load(`/latest?page=${page}`)).document),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const text = (id: string) =>
        typeof filters[id] === 'string' && filters[id] ? (filters[id] as string) : undefined;
      const { url, document } = await load(
        withQuery(`${BASE_URL}/series`, {
          q: query.trim(),
          status: text('status'),
          genre: text('genre'),
          sort: text('sort') ?? 'updated',
          page: page > 1 ? String(page) : undefined,
        }),
      );
      // An exact match opens the series page itself.
      if (document.selectFirst('aside.series-left')) {
        const d = details(document, relativeUrl(url));
        return { items: [{ url: d.url, title: d.title, thumbnailUrl: d.thumbnailUrl }], hasNextPage: false };
      }
      return cards(document);
    },
    async getFilters(): Promise<Filter[]> {
      const filters: Filter[] = [
        {
          type: 'select',
          id: 'status',
          label: 'Status',
          options: ['All', 'Ongoing', 'Completed', 'Hiatus'].map((s, i) => ({ label: s, value: i ? s : '' })),
        },
        { type: 'select', id: 'sort', label: 'Sort', options: SORTS.map(([label, value]) => ({ label, value })) },
      ];
      try {
        const genres = (await load('/en/genres')).document.select('a.panel.genre-card').map((a) => ({
          label: a.selectFirst('strong')?.text() ?? '',
          value: (a.absUrl('href') || '').split('/').pop() ?? '',
        }));
        if (genres.length)
          filters.push({
            type: 'select',
            id: 'genre',
            label: 'Genre',
            options: [{ label: 'All', value: '' }, ...genres],
          });
      } catch (error) {
        log.warn('Cannot load genres', error);
      }
      return filters;
    },
    getMangaDetails: async (manga: MangaSummary) => {
      const d = details((await load(manga.url)).document, manga.url);
      return { ...d, title: d.title || manga.title, thumbnailUrl: d.thumbnailUrl ?? manga.thumbnailUrl };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      return (await load(manga.url)).document
        .select('div.series-v72-chapter-list a.series-v72-chapter-row')
        .map((a) => {
          const time = Date.parse(a.selectFirst('time.series-chapter-date')?.attr('datetime') ?? '');
          return {
            url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
            name: a.selectFirst('.series-chapter-number-text')?.text() ?? a.text(),
            uploadedAt: Number.isFinite(time) ? time : undefined,
          };
        });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      return (await load(chapter.url)).document
        .select('div.reader-pages img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('data-src') || img.absUrl('src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)((?:\/[a-z]{2})?\/series\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
