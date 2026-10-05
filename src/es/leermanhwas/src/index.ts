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
import { USER_AGENT, relativeUrl } from './common/utils';

const BASE_URL = 'https://leermanhwas.com';
// Other hosts (the image CDN) get no Referer.
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const GENRES: [string, string][] = [
  ['Todos', ''],
  ['Acción', 'accion'],
  ['Adulto', 'adulto'],
  ['Ciencia ficción', 'ciencia-ficcion'],
  ['Comedia', 'comedia'],
  ['Drama', 'drama'],
  ['Familia', 'familia'],
  ['Fantasía', 'fantasia'],
  ['Harem', 'harem'],
  ['Josei', 'josei'],
  ['Maduro', 'maduro'],
  ['Reencarnación', 'reencarnacion'],
  ['Romance', 'romance'],
  ['Seinen', 'seinen'],
  ['Shonen', 'shonen'],
  ['Smut', 'smut'],
  ['Sobrenatural', 'sobrenatural'],
  ['Vida escolar', 'vida-escolar'],
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const pageUrl = (page: number) => (page === 1 ? BASE_URL : `${BASE_URL}/page/${page}/`);

function hasNextPage(document: HtmlElement, page: number): boolean {
  return !!document.selectFirst(
    `ul.pagination a[href*="/page/${page + 1}/"], .pagination a[href*="/page/${page + 1}/"]`,
  );
}

function imageOf(img: HtmlElement | null | undefined): string | undefined {
  if (!img) return undefined;
  return img.attr('data-src')?.trim() || img.absUrl('src') || undefined;
}

function parseMangaList(document: HtmlElement): MangaSummary[] {
  const seen = new Set<string>();
  return document.select('div.latest-item').flatMap((element): MangaSummary[] => {
    const link = element.selectFirst('div.latest-left > a[href], div.mm-name > a[href]');
    const title = element.selectFirst('h3.title-smaller')?.text().trim();
    if (!link || !title) return [];
    const url = relativeUrl(link.absUrl('href') || link.attr('href') || '');
    if (seen.has(url)) return [];
    seen.add(url);
    return [{ url, title, thumbnailUrl: imageOf(element.selectFirst('img.img-latest')) }];
  });
}

function toStatus(status: string | undefined): MangaStatus {
  switch (status?.trim().toLowerCase()) {
    case 'ongoing':
    case 'en curso':
      return 'ongoing';
    case 'completed':
    case 'completo':
    case 'finalizado':
      return 'completed';
    case 'hiatus':
    case 'en pausa':
      return 'hiatus';
    case 'cancelled':
    case 'cancelado':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

async function list(page: number): Promise<MangaPage> {
  const document = await load(pageUrl(page));
  return { items: parseMangaList(document), hasNextPage: hasNextPage(document, page) };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: list,
    getLatest: list,
    async search(query, page, filters: FilterState): Promise<MangaPage> {
      const genre = typeof filters.genre === 'string' ? filters.genre : '';
      let url: string;
      if (query.trim()) url = `${BASE_URL}/search?s=${encodeURIComponent(query.trim())}`;
      else if (genre && page === 1) url = `${BASE_URL}/genero/${genre}/`;
      else if (genre) url = `${BASE_URL}/genero/${genre}/page/${page}/`;
      else url = pageUrl(page);
      const document = await load(url);
      return { items: parseMangaList(document), hasNextPage: hasNextPage(document, page) };
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'Escribe un título o selecciona un género.' },
      {
        type: 'select',
        id: 'genre',
        label: 'Género',
        options: GENRES.map(([label, value]) => ({ label, value })),
        default: '',
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(`${BASE_URL}${manga.url}`);
      // The genre and status rows are list items headed by an <h5>.
      const row = (heading: string) =>
        document.select('li').find((li) => li.selectFirst('h5')?.text().trim() === heading);
      return {
        url: manga.url,
        title: document.selectFirst('h1.main-info-title')?.text().trim() ?? manga.title,
        thumbnailUrl: imageOf(document.selectFirst('img.img-cover')) ?? manga.thumbnailUrl,
        description: document.selectFirst('div.short-desc-content')?.text().trim() || undefined,
        genres: row('Géneros')
          ?.select('a[rel=tag]')
          .map((a) => a.text().trim()),
        status: toStatus(row('Estado')?.selectFirst('span')?.text()),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(`${BASE_URL}${manga.url}`);
      return document.select('ul.chapter-list a.leermos[href]').flatMap((element): Chapter[] => {
        const name = element.selectFirst('span.chapter-name')?.text().trim();
        const url = element.absUrl('href');
        if (!name || !url) return [];
        const number = /(\d+(?:\.\d+)?)/.exec(name)?.[1];
        return [{ url: relativeUrl(url), name, number: number ? Number(number) : -1 }];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(`${BASE_URL}${chapter.url}`);
      return document
        .select('div.reading-content img')
        .map((img) => imageOf(img))
        .filter((url): url is string => !!url)
        .map((imageUrl, index) => ({ index, imageUrl }));
    },
    // The image hosts get no Referer.
    imageHeaders: () => ({ 'User-Agent': USER_AGENT }),
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
    resolveUrl(url): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?leermanhwas\.com(\/manhwa\/[^/?#]+)/i.exec(url);
      return match ? { url: `${match[1]}/`, title: '' } : null;
    },
  }),
});
