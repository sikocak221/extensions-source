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
import { USER_AGENT, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://doujinhentai.net';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const GENRES: [string, string][] = [
  ['<todos>', ''],
  ['Ahegao', 'ahegao'],
  ['Anal', 'anal'],
  ['Bikini', 'bikini'],
  ['Casadas', 'casadas'],
  ['Chica Con Pene', 'chica-con-pene'],
  ['Cosplay', 'cosplay'],
  ['Doble Penetracion', 'doble-penetracion'],
  ['Ecchi', 'ecchi'],
  ['Embarazada', 'embarazada'],
  ['Enfermera', 'enfermera'],
  ['Escolares', 'escolares'],
  ['Full Color', 'full-colo'],
  ['Futanari', 'futanari'],
  ['Grandes Pechos', 'grandes-pechos'],
  ['Harem', 'harem'],
  ['Incesto', 'incesto'],
  ['Interracial', 'interracial'],
  ['Juguetes Sexuales', 'juguetes-sexuales'],
  ['Lolicon', 'lolicon'],
  ['Maduras', 'maduras'],
  ['Mamadas', 'mamadas'],
  ['Masturbacion', 'masturbacion'],
  ['MILF', 'milf'],
  ['Orgias', 'orgias'],
  ['Profesores', 'profesores'],
  ['Romance', 'romance'],
  ['Shota', 'shota'],
  ['Sin Censura', 'sin-censura'],
  ['Sirvientas', 'sirvientas'],
  ['Tentaculos', 'tentaculos'],
  ['Tetonas', 'tetonas'],
  ['Virgenes', 'virgenes'],
  ['Yaoi', 'yaoi'],
  ['Yuri', 'yuri'],
];
const TYPES: [string, string][] = [
  ['<todos>', ''],
  ['Doujin', 'doujin'],
  ['Manga', 'manga'],
  ['Comic', 'comic'],
];
const SORTS: [string, string][] = [
  ['Alfabético', 'alphabet'],
  ['Más vistos', 'views'],
  ['Más recientes', 'last'],
];
const LETTERS: [string, string][] = [
  ['<todas>', ''],
  ['#  (0-9)', '0'],
  ['A', 'a'],
  ['B', 'b'],
  ['C', 'c'],
  ['D', 'd'],
  ['E', 'e'],
  ['F', 'f'],
  ['G', 'g'],
  ['H', 'h'],
  ['I', 'i'],
  ['J', 'j'],
  ['K', 'k'],
  ['L', 'l'],
  ['M', 'm'],
  ['N', 'n'],
  ['Ñ', 'ñ'],
  ['O', 'o'],
  ['P', 'p'],
  ['Q', 'q'],
  ['R', 'r'],
  ['S', 's'],
  ['T', 't'],
  ['U', 'u'],
  ['V', 'v'],
  ['W', 'w'],
  ['X', 'x'],
  ['Y', 'y'],
  ['Z', 'z'],
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function mangasPage(document: HtmlElement): MangaPage {
  const items = document.select('div.group.bg-white.rounded-2xl a.block').flatMap((element): MangaSummary[] => {
    const title = element.selectFirst('h3.font-bold')?.text();
    if (!title) return [];
    const img = element.selectFirst('img');
    return [
      {
        url: relativeUrl(element.attr('href') ?? ''),
        title,
        thumbnailUrl: img?.absUrl('src') || img?.absUrl('data-src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: !!document.selectFirst('a[rel=next]') };
}

const texts = (elements: HtmlElement[]) => elements.map((e) => e.text()).filter((t) => t.trim());

function parseDetails(document: HtmlElement, url: string): MangaDetails {
  const main = document.selectFirst('main#main-content') ?? document;
  const authors = texts(main.select('a[rel=author]'));
  const artists = texts(main.select("a[href*='/artist/']"));
  const categories = texts(main.select("a[rel=tag][href*='/category/']"));
  const tags = main
    .select("a[rel=tag][href*='/tag/']")
    .map((a) => a.text().replace(/^#+/, ''))
    .filter((t) => t.trim());
  const statusText =
    main.selectFirst('span[aria-label^=Estado]')?.text() ?? main.selectFirst('div.absolute span')?.text() ?? '';
  const status: MangaStatus = /ongoing|en curso/i.test(statusText)
    ? 'ongoing'
    : /complet/i.test(statusText)
      ? 'completed'
      : 'unknown';
  return {
    url,
    title: main.selectFirst('h1')?.text() ?? '',
    author: (authors.length ? authors : artists).join(', ') || undefined,
    artist: (artists.length ? artists : authors).join(', ') || undefined,
    description: main.selectFirst('div.prose')?.text() || undefined,
    genres: [...new Set([...categories, ...tags])],
    status,
    thumbnailUrl: main.selectFirst('figure img')?.absUrl('src') || undefined,
  };
}

const enc = (value: string) => encodeURIComponent(value.trim()).replace(/%20/g, '%20');

// The text search ignores the filters. The route filters exclude each other: the first one with a value wins, in
// the order genre > artist > author > scanlator > letter > type; the sort only applies when none is set.
async function search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
  if (query.trim()) {
    return mangasPage(await load(`${BASE_URL}/lista-manga-hentai?search=${encodeURIComponent(query)}&page=${page}`));
  }
  const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string).trim() : '');
  let path: string;
  if (text('genre')) path = `lista-manga-hentai/category/${text('genre')}`;
  else if (text('artist')) path = `lista-manga-hentai/artist/${enc(text('artist'))}`;
  else if (text('author')) path = `lista-manga-hentai/author/${enc(text('author'))}`;
  else if (text('scanlator')) path = `user/${enc(text('scanlator'))}`;
  else if (text('letter')) path = `lista-manga-hentai/letra/${text('letter')}`;
  else if (text('type')) path = `lista-de-${text('type')}`;
  else path = `lista-manga-hentai${text('sort') ? `?orderby=${text('sort')}` : ''}`;
  return mangasPage(await load(`${BASE_URL}/${path}${path.includes('?') ? '&' : '?'}page=${page}`));
}

const select = (id: string, label: string, entries: [string, string][]): Filter => ({
  type: 'select',
  id,
  label,
  options: entries.map(([label, value]) => ({ label, value })),
  default: entries[0]![1],
});

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => mangasPage(await load(`${BASE_URL}/lista-manga-hentai?orderby=views&page=${page}`)),
    getLatest: async (page) => mangasPage(await load(`${BASE_URL}/lista-manga-hentai?orderby=last&page=${page}`)),
    search,
    getFilters: (): Filter[] => [
      { type: 'header', label: 'La búsqueda por texto ignora los filtros' },
      { type: 'header', label: 'Los filtros de ruta son mutuamente excluyentes' },
      { type: 'separator' },
      select('genre', 'Género', GENRES),
      { type: 'separator' },
      select('type', 'Tipo de obra', TYPES),
      { type: 'separator' },
      select('sort', 'Ordenar por (sin otros filtros)', SORTS),
      { type: 'separator' },
      { type: 'header', label: 'Buscar por artista o autor exacto (ej: saigado, milftoon)' },
      { type: 'text', id: 'artist', label: 'Artista (ej: saigado, milftoon)' },
      { type: 'text', id: 'author', label: 'Autor (ej: horori, milftoon)' },
      { type: 'separator' },
      { type: 'header', label: 'Buscar por scanlator/usuario exacto (ej: NekoCreme, Fritz Translations)' },
      { type: 'text', id: 'scanlator', label: 'Scanlator/usuario (ej: NekoCreme, Fritz Translations)' },
      { type: 'separator' },
      { type: 'header', label: 'Filtrar por primera letra del título' },
      select('letter', 'Primera letra', LETTERS),
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      return parseDetails(await load(`${BASE_URL}${manga.url}`), manga.url);
    },
    // The chapter slug does not always contain "chapter" (e.g. /roman, /bokura).
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(`${BASE_URL}${manga.url}`);
      return document.select('div.flex.items-center.gap-4.p-3.mb-2.border.rounded-lg').map((element): Chapter => {
        const link = element.selectFirst('div.flex-1 > a.font-bold') ?? element.selectFirst('div.flex-1 a');
        const baseName = link?.text().replace(/^Leer /, '') ?? '';
        const subTitle = element.selectFirst('div.flex-1 div.text-sm.font-medium')?.text() ?? '';
        const right = element.select('div.text-sm.text-right span.font-medium');
        const dateText = right[right.length - 1]?.text();
        return {
          url: relativeUrl(link?.attr('href') ?? ''),
          name: subTitle && subTitle !== baseName ? `${baseName}: ${subTitle}` : baseName,
          scanlator: element.selectFirst("div.text-sm.text-right a[href*='/user/']")?.text() || undefined,
          uploadedAt: dateText ? parseDate(dateText, 'd MMM. yyyy') : undefined,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.get(`${BASE_URL}${chapter.url}`, { headers });
      const document = html.load(response.body, { baseUrl: response.url });

      // 1. JSON embedded in a script: const pageUrls = {"1":"url",...};
      const script = document
        .select('script')
        .map((s) => s.html())
        .find((text) => text.includes('pageUrls'));
      const json = script ? /const pageUrls\s*=\s*(\{[^;]+\})/.exec(script)?.[1] : undefined;
      if (json) {
        const pages = [...json.matchAll(/"(\d+)"\s*:\s*"([^"]+)"/g)]
          .map((m) => ({ n: Number(m[1]), imageUrl: m[2]!.replace(/\\\//g, '/') }))
          .sort((a, b) => a.n - b.n)
          .map(({ imageUrl }, index) => ({ index, imageUrl }));
        if (pages.length > 0) return pages;
      }
      // 2. Images rendered in the markup, 3. single page mode.
      const imgs = (selector: string) =>
        document
          .select(selector)
          .map((img) => img.absUrl('src') || img.attr('src') || '')
          .filter(Boolean)
          .map((imageUrl, index) => ({ index, imageUrl }));
      const rendered = imgs('div#vertical-pages-container div[data-page] img');
      return rendered.length > 0 ? rendered : imgs('div.single-page-mode img.manga-image');
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
    resolveUrl(url): MangaSummary | null {
      const slug = /^https?:\/\/(?:www\.)?doujinhentai\.net\/manga-hentai\/([^/?#]+)/i.exec(url)?.[1];
      return slug ? { url: `/manga-hentai/${slug}`, title: '' } : null;
    },
  }),
});
