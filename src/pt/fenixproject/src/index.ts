import {
  type Chapter,
  type Filter,
  type HtmlElement,
  type MangaPage,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { hostOf, parseDate, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://fenixproject.website';
const DETAIL_CHAPTER_LIMIT = 10;
// Site dates are dd/MM/yyyy in America/Sao_Paulo (UTC-3, no DST).
const SITE_OFFSET_MS = 3 * 60 * 60 * 1000;
const DATE_REGEX = /^\d{2}\/\d{2}\/\d{4}$/;
const CHAPTER_NUMBER_REGEX = /capitulo-(\d+(?:\.\d+)?)/;

const GENRES = [
  { label: 'Todos', value: '' },
  { label: 'Adaptação', value: '12' },
  { label: 'Amigos de Infância', value: '14' },
  { label: 'Angústia', value: '15' },
  { label: 'Animais', value: '51' },
  { label: 'Aventura', value: '2' },
  { label: 'Ação', value: '1' },
  { label: 'Casamento Arranjado', value: '17' },
  { label: 'Comédia', value: '3' },
  { label: 'Conto', value: '18' },
  { label: 'Dark Romance', value: '9' },
  { label: 'Demônios', value: '50' },
  { label: 'Drama', value: '4' },
  { label: 'Escolar', value: '19' },
  { label: 'Escritório', value: '20' },
  { label: 'Familia', value: '48' },
  { label: 'Fantasia', value: '5' },
  { label: 'Ficção Científica', value: '49' },
  { label: 'Harém Reverso', value: '24' },
  { label: 'Histórico', value: '11' },
  { label: 'Josei', value: '25' },
  { label: 'Magia', value: '26' },
  { label: 'Mistério', value: '6' },
  { label: 'Moderno', value: '10' },
  { label: 'Médico', value: '38' },
  { label: 'Oneshot', value: '29' },
  { label: 'Redenção', value: '30' },
  { label: 'Reencarnação', value: '31' },
  { label: 'Romance', value: '7' },
  { label: 'Shoujo', value: '33' },
  { label: 'Shounen', value: '34' },
  { label: 'Slice of Life', value: '35' },
  { label: 'Sobrenatural', value: '36' },
  { label: 'Stalker', value: '37' },
  { label: 'Terror', value: '8' },
  { label: 'Tragédia', value: '39' },
  { label: 'Traição', value: '40' },
  { label: 'Transmigração', value: '41' },
  { label: 'Troca de Corpos', value: '42' },
  { label: 'Vampiro', value: '43' },
  { label: 'Viagem no Tempo', value: '44' },
  { label: 'Vingança', value: '47' },
  { label: 'Yuri', value: '46' },
];

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url);
  return html.load(response.body, { baseUrl: response.url });
}

async function fetchListing(url: string): Promise<MangaPage> {
  const document = await fetchDocument(url);
  const items = document.select('#works-grid > div').flatMap((card) => {
    const link = card.selectFirst("a[href^='/manga/']");
    if (!link) return [];
    const slug = (link.attr('href') ?? '').replace(/^\/manga\//, '').replace(/^\/+|\/+$/g, '');
    const img = card.selectFirst('img');
    const title = card.selectFirst('h3')?.text() || img?.attr('alt')?.trim();
    if (!slug || !title) return [];
    return [{ url: `/manga/${slug}`, title, thumbnailUrl: img?.absUrl('src') }];
  });
  return { items, hasNextPage: document.selectFirst('a[rel=next]') !== null };
}

function parseStatus(status: string | undefined): 'ongoing' | 'completed' | 'hiatus' | 'cancelled' | 'unknown' {
  const value = (status ?? '').toLowerCase();
  if (value.includes('andamento')) return 'ongoing';
  if (value.includes('conclu')) return 'completed';
  if (value.includes('hiato')) return 'hiatus';
  if (value.includes('cancel')) return 'cancelled';
  return 'unknown';
}

const chapterNumber = (href: string): number | undefined => {
  const n = CHAPTER_NUMBER_REGEX.exec(href)?.[1];
  return n === undefined ? undefined : Number(n);
};

const fmt = (n: number): string => String(n);

function cardDate(card: HtmlElement): number | undefined {
  const text = card
    .select('span')
    .map((s) => s.text())
    .find((t) => DATE_REGEX.test(t));
  const time = parseDate(text, 'dd/MM/yyyy');
  return time === undefined ? undefined : time + SITE_OFFSET_MS;
}

function parseDetailChapter(card: HtmlElement): Chapter | null {
  const href = card.selectFirst("a[href*='/capitulo-']")?.attr('href');
  if (!href) return null;
  const number = chapterNumber(href);
  return {
    url: href,
    name: card.selectFirst('span[title]')?.text() || (number !== undefined ? `Capítulo ${fmt(number)}` : 'Capítulo'),
    number,
    uploadedAt: cardDate(card),
  };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => fetchListing(`${BASE_URL}/manhwas?pagina=${page}`),
    search: async (query, page, filters) => {
      if (query.trim()) {
        return fetchListing(withQuery(`${BASE_URL}/pesquisar`, { q: query.trim(), pagina: String(page) }));
      }
      const genre = filters.genre;
      if (typeof genre === 'string' && genre) {
        return fetchListing(`${BASE_URL}/manhwas?genero=${genre}&pagina=${page}`);
      }
      return fetchListing(`${BASE_URL}/manhwas?pagina=${page}`);
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'O gênero é ignorado ao buscar por texto' },
      { type: 'select', id: 'genre', label: 'Gênero', options: GENRES, default: '' },
    ],
    getMangaDetails: async (manga) => {
      const document = await fetchDocument(BASE_URL + manga.url);
      const fields: Record<string, string> = {};
      const dts = document.select('dl dt');
      const dds = document.select('dl dd');
      dts.forEach((dt, i) => {
        fields[dt.text()] = dds[i]?.text() ?? '';
      });
      const field = (name: string): string | undefined => {
        const v = fields[name];
        return v && v !== '—' ? v : undefined;
      };
      const synopsis = document.selectFirst('h2:contains(Sinopse) + *');
      return {
        url: manga.url,
        title: document.selectFirst('main h1')?.text() || manga.title,
        thumbnailUrl: document.selectFirst("main img[alt]:not([alt=''])")?.absUrl('src') ?? manga.thumbnailUrl,
        author: field('Autor'),
        artist: field('Artista'),
        status: parseStatus(fields.Status),
        genres: document.select("a[href*='genero=']").map((a) => a.text()),
        description: synopsis?.text(),
      };
    },
    getChapters: async (manga): Promise<Chapter[]> => {
      const document = await fetchDocument(BASE_URL + manga.url);
      const cards = document.select("div[id^='chapter-card-']");
      const fromCards = () => cards.flatMap((card) => parseDetailChapter(card) ?? []);
      // The detail page renders at most the 10 latest chapters; the full list is in the chapter page's selector.
      if (cards.length < DETAIL_CHAPTER_LIMIT) return fromCards();

      const dates = new Map<string, number | undefined>();
      for (const card of cards) {
        const href = card.selectFirst("a[href*='/capitulo-']")?.attr('href');
        if (href) dates.set(href, cardDate(card));
      }
      const latest = cards[0]?.selectFirst("a[href*='/capitulo-']")?.absUrl('href');
      if (!latest) return fromCards();

      const full = (await fetchDocument(latest)).select("#chapter-select-top a[href*='/capitulo-']").map((link) => {
        const href = link.attr('href') ?? '';
        const number = chapterNumber(href);
        return {
          url: href,
          name: link.text() || (number !== undefined ? `Capítulo ${fmt(number)}` : 'Capítulo'),
          number,
          uploadedAt: dates.get(href),
        } satisfies Chapter;
      });
      return (full.length > 0 ? full : fromCards()).sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
    },
    getPages: async (chapter): Promise<Page[]> => {
      const document = await fetchDocument(BASE_URL + chapter.url);
      return document.select("img[alt^='Página ']").map((img, index) => ({ index, imageUrl: img.absUrl('src') || '' }));
    },
    resolveUrl: (url) => {
      if (hostOf(url) !== hostOf(BASE_URL)) return null;
      const match = /\/manga\/([^/?#]+)/.exec(relativeUrl(url));
      return match?.[1] ? { url: `/manga/${match[1]}`, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
