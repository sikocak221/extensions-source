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
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://hentaikun.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const NEXT = 'ul.pagination li[aria-label=Next]';

async function load(url: string, extra: Record<string, string> = {}): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers: { ...headers, ...extra } });
  return html.load(response.body, { baseUrl: response.url });
}

function tableListing(document: HtmlElement): MangaSummary[] {
  return document.select('table.table-striped tr:not(.danger)').flatMap((row): MangaSummary[] => {
    const a = row.selectFirst('td:first-child a');
    if (!a) return [];
    const thumb = /src=["']([^"']+)["']/.exec(a.attr('title') ?? '')?.[1];
    return [
      {
        url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
        title: a.text(),
        thumbnailUrl: thumb ? absoluteUrl(BASE_URL, thumb) : undefined,
      },
    ];
  });
}

function galleryListing(document: HtmlElement): MangaSummary[] {
  return document.select("div.thumbnail[id^='galary-']").flatMap((div): MangaSummary[] => {
    const a = div.selectFirst('div.overlay a');
    if (!a) return [];
    return [
      {
        url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
        title: a.text(),
        thumbnailUrl: div.selectFirst('img.img-responsive')?.absUrl('src') || undefined,
      },
    ];
  });
}

async function list(path: string, page: number): Promise<MangaPage> {
  const document = await load(`${path}${page > 1 ? `${page}/` : ''}`);
  return { items: tableListing(document), hasNextPage: document.selectFirst(NEXT) != null };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list('/manga/manga-list/most-viewed/', page),
    getLatest: (page) => list('/manga/manga-list/last-updated/', page),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (!query.trim()) return list('/manga/manga-list/most-viewed/', page);
      const type = typeof filters.type === 'string' && filters.type ? filters.type : 'title';
      const document = await load(
        `/manga/search/${type}/${encodeURIComponent(query.trim())}/${page > 1 ? `${page}/` : ''}`,
      );
      return {
        items: document.selectFirst('table.table-striped') ? tableListing(document) : galleryListing(document),
        hasNextPage: document.selectFirst(NEXT) != null,
      };
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'type',
        label: 'Search by',
        options: ['Title', 'Artist', 'Category', 'Translator'].map((l) => ({ label: l, value: l.toLowerCase() })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const category = document.selectFirst('h2:has(strong:contains(Category)) a')?.text();
      return {
        url: manga.url,
        title: document.selectFirst('div.single_title h1')?.text() || manga.title,
        thumbnailUrl: document.selectFirst("meta[property='og:image']")?.absUrl('content') || manga.thumbnailUrl,
        author:
          document
            .select('h2:has(strong:contains(Artist)) a')
            .map((a) => a.text())
            .join(', ') || undefined,
        genres: [
          ...(category ? [category] : []),
          ...document.select("div.desc a[href*='/tag/'] span.label-danger").map((s) => s.text()),
        ],
        status: 'completed',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      return document.select('table tr:has(a.readchap)').map((row) => {
        const a = row.selectFirst('a.readchap')!;
        const name = a.text() || 'Chapter';
        return {
          url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
          name,
          number: Number(/(\d+(?:\.\d+)?)/.exec(name)?.[1] ?? 1),
          uploadedAt: parseDate(row.selectFirst('td:last-child h6')?.text(), 'dd-MM-yyyy'),
        };
      });
    },
    // The reader wants a "<manga>/<chapter>=2" cookie (the "all pages" mode) to list the images.
    async getPages(chapter: Chapter): Promise<Page[]> {
      const segments = chapter.url.split('/').filter(Boolean);
      const cookie: Record<string, string> = segments.length >= 4 ? { Cookie: `${segments[2]}/${segments[3]}=2` } : {};
      const body = (await load(chapter.url, cookie)).html();
      const json = body.split('var jsondata=')[1]?.split(';')[0];
      if (!json) throw new Error('Could not find any images for this chapter.');
      return (JSON.parse(json) as string[]).map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/manga\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
