import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, findRscObject, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://toonz.to';
// Adult content is behind a confirmation cookie (and a rating preference cookie).
const headers = {
  'User-Agent': USER_AGENT,
  Referer: `${BASE_URL}/`,
  Cookie: 'adult_ok=1; reader_prefs=%7B%22rating%22%3A%22pornographic%22%7D',
};
const CATALOGS: [string, string][] = [
  ['All', 'comics'],
  ['Manhwa', 'manhwa/browse'],
  ['Manga', 'manga/browse'],
  ['Western', 'western/browse'],
  ['Adult', 'adult/browse'],
];
const PATH = /^\/(?:manhwa|manga|western|comic)\/([^/]+)$/;

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url.startsWith('http') ? url : `${BASE_URL}${url}`, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const MENU = new Set([
  'browse',
  'top-rated',
  'most-popular',
  'trending',
  'most-favorited',
  'latest',
  'new',
  'completed',
  'ongoing',
]);

// Series cards are "div.group" blocks: an overlay link (aria-label = title) and the cover image.
async function list(url: string, page: number): Promise<MangaPage> {
  const document = await load(url);
  const seen = new Set<string>();
  const items: MangaSummary[] = [];
  for (const card of document.select('div.group')) {
    const a = card
      .select('a[href]')
      .find((link) => PATH.test(relativeUrl(link.absUrl('href') || link.attr('href') || '')));
    if (!a) continue;
    const path = relativeUrl(a.absUrl('href') || a.attr('href') || '');
    if (seen.has(path) || MENU.has(path.split('/')[2] ?? '')) continue;
    const title = card.selectFirst('h3')?.text() || a.attr('aria-label')?.trim() || a.text();
    if (!title) continue;
    seen.add(path);
    items.push({ url: path, title, thumbnailUrl: card.selectFirst('img[src]')?.absUrl('src') || undefined });
  }
  return { items, hasNextPage: document.selectFirst(`a[href*="page=${page + 1}"]`) != null };
}

async function comicId(url: string): Promise<{ id: string; document: HtmlElement }> {
  const document = await load(url);
  const id = document
    .select('script')
    .map((s) => /comicId[^:]*:(\d+)/.exec(s.html())?.[1])
    .find(Boolean);
  if (!id) throw new Error('Could not find the comic id');
  return { id, document };
}

// Chapter urls are "<manga url>/chapter/<slug>".
export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`/comics?sort=popular&page=${page}`, page),
    getLatest: (page) => list(`/comics?sort=latest&page=${page}`, page),
    search(query: string, page: number, filters: FilterState) {
      if (query.trim()) return list(`/search?q=${encodeURIComponent(query.trim())}&page=${page}`, page);
      const text = (id: string, fallback: string) =>
        typeof filters[id] === 'string' && filters[id] ? (filters[id] as string) : fallback;
      const sort = text('sort', 'popular');
      const genre = text('genre', '');
      return list(
        genre ? `/genre/${genre}?sort=${sort}&page=${page}` : `/${text('catalog', 'comics')}?sort=${sort}&page=${page}`,
        page,
      );
    },
    async getFilters(): Promise<Filter[]> {
      const filters: Filter[] = [
        {
          type: 'select',
          id: 'catalog',
          label: 'Catalog',
          options: CATALOGS.map(([label, value]) => ({ label, value })),
        },
        {
          type: 'select',
          id: 'sort',
          label: 'Sort',
          options: [
            { label: 'Popular', value: 'popular' },
            { label: 'Latest updates', value: 'latest' },
          ],
        },
      ];
      try {
        const genres = (
          await http.get<{ name: string; slug: string }[]>(`${BASE_URL}/api/genres`, { headers, responseType: 'json' })
        ).body;
        filters.push(
          { type: 'separator' },
          {
            type: 'select',
            id: 'genre',
            label: 'Genre',
            options: [{ label: 'None', value: '' }, ...genres.map((g) => ({ label: g.name, value: g.slug }))],
          },
        );
      } catch (error) {
        log.warn('Cannot load genres', error);
      }
      return filters;
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const authors =
        document
          .select('a[href^="/author/"]')
          .map((a) => a.text())
          .join(', ') || undefined;
      const status = document.selectFirst('dt:contains(Status) + dd')?.text().toLowerCase();
      return {
        url: manga.url,
        title: document.selectFirst('h1')?.text() || manga.title,
        thumbnailUrl:
          document.selectFirst('img[data-cover]')?.absUrl('src') ||
          document.selectFirst('div.group img[src]')?.absUrl('src') ||
          manga.thumbnailUrl,
        description:
          document.selectFirst('div.prose')?.text() ||
          document.selectFirst('meta[name=description]')?.attr('content')?.trim(),
        author: authors,
        artist: authors,
        genres: document.select('a[href^="/genre/"]').map((a) => a.text()),
        status: status === 'ongoing' ? 'ongoing' : status === 'completed' ? 'completed' : 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { id } = await comicId(manga.url);
      const data = (
        await http.get<{
          chapters?: { chapterNumber: string; title?: string | null; slug: string; date?: string | null }[];
        }>(`${BASE_URL}/api/comics/${id}/chapters`, { headers, responseType: 'json' })
      ).body;
      return (data.chapters ?? []).map((c) => {
        const n = Number(c.chapterNumber);
        const num = Number.isFinite(n) ? String(n) : c.chapterNumber;
        const title = c.title?.trim();
        const time = c.date ? Date.parse(c.date) : Number.NaN;
        return {
          url: `${manga.url}/chapter/${c.slug.replace(/^chapter-/, '')}`,
          name: title ? (/^(chapter|ch\.)/i.test(title) ? title : `Chapter ${num}: ${title}`) : `Chapter ${num}`,
          number: Number.isFinite(n) ? n : undefined,
          uploadedAt: Number.isFinite(time) ? time : undefined,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const body = (await http.get(`${BASE_URL}${chapter.url}`, { headers: { ...headers, rsc: '1' } })).body;
      const data = findRscObject<{ images: { filename: string }[] }>(body, (v) => Array.isArray(v.images));
      return (data?.images ?? []).map((img, index) => ({
        index,
        imageUrl: `${BASE_URL}/uploads/${img.filename.replace(/^\//, '')}`,
      }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/(?:manhwa|manga|western|comic)\/[^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
