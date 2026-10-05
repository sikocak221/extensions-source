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
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://mantrazscan.co';
const headers = {
  'User-Agent': USER_AGENT,
  Referer: `${BASE_URL}/`,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

const GENRES: [string, string][] = [
  ['Todos', ''],
  ['Romance', 'romance'],
  ['Drama', 'drama'],
  ['Fantasía', 'fantasia'],
  ['Comedia', 'comedia'],
  ['Acción', 'accion'],
  ['Aventura', 'aventura'],
  ['Harem', 'harem'],
  ['Isekai', 'isekai'],
  ['Manhwa', 'manhwa'],
  ['Manga', 'manga'],
  ['Manhua', 'manhua'],
  ['Shounen', 'shounen'],
  ['Seinen', 'seinen'],
  ['BL', 'bl'],
  ['Yaoi', 'yaoi'],
  ['Yuri', 'yuri'],
  ['+18', '18'],
  ['Sin censura', 'sin-censura'],
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function mangaPage(document: HtmlElement, page: number): MangaPage {
  const seen = new Set<string>();
  const items = document.select('div.s-card').flatMap((card): MangaSummary[] => {
    const href = card.selectFirst('a.s-card-imglink')?.absUrl('href');
    const title = card.selectFirst('a.s-card-title')?.text().trim();
    if (!href || !title) return [];
    const url = relativeUrl(href);
    if (seen.has(url)) return [];
    seen.add(url);
    const img = card.selectFirst('img');
    return [{ url, title, thumbnailUrl: img?.absUrl('src') || img?.attr('src') || undefined }];
  });
  return { items, hasNextPage: document.selectFirst(`a[href*="/explorar/page/${page + 1}/"]`) !== null };
}

const list = async (page: number) => mangaPage(await load(page === 1 ? '/explorar/' : `/explorar/page/${page}/`), page);

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: list,
    getLatest: list,
    getFilters: (): Filter[] => [
      { type: 'header', label: 'Filtrar por género' },
      {
        type: 'select',
        id: 'genre',
        label: 'Género',
        default: '',
        options: GENRES.map(([label, value]) => ({ label, value })),
      },
    ],
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params: string[] = [];
      if (query.trim()) params.push(`q=${encodeURIComponent(query.trim())}`);
      if (typeof filters.genre === 'string' && filters.genre) params.push(`genero=${filters.genre}`);
      return mangaPage(await load(`/explorar/${params.length ? `?${params.join('&')}` : ''}`), page);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const cover = document.selectFirst('.series-cover img');
      return {
        url: manga.url,
        title: document.selectFirst('h1')?.text() || manga.title,
        thumbnailUrl: cover?.absUrl('src') || cover?.attr('src') || manga.thumbnailUrl,
        genres: document
          .select('a.genre-tag')
          .map((a) => a.text().trim())
          .filter(Boolean),
        description: document.selectFirst('.series-desc')?.text() || undefined,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      const seen = new Set<string>();
      return document
        .select('a.ch-row')
        .flatMap((a): (Chapter & { number: number })[] => {
          const href = a.absUrl('href');
          const number = href ? /capitulo-(\d+(?:\.\d+)?)/.exec(href)?.[1] : undefined;
          if (!href || !number) return [];
          const url = relativeUrl(href);
          if (seen.has(url)) return [];
          seen.add(url);
          return [{ url, name: `Capítulo ${number}`, number: Number(number) }];
        })
        .sort((a, b) => b.number - a.number)
        .map(({ number: _number, ...chapter }) => chapter);
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const body = (await http.get(absoluteUrl(BASE_URL, chapter.url), { headers })).body;
      const urls = (
        body.match(
          /https:\\?\/\\?\/img\.mantrazscan\.co[^"\\ ]*(?:\\\/[^"\\ ]*)*\/WP-manga\/[^"\\ ]+\.(?:webp|jpe?g|png)/gi,
        ) ?? []
      ).map((url) => url.replace(/\\\//g, '/'));
      return [...new Set(urls)].map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/manga\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
