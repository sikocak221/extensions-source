import {
  type Chapter,
  type Filter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'http://www.agcscanlation.it';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const STATES: [label: string, id: string][] = [
  ['In corso', 'progettiincorso'],
  ['Finito', 'progetticonclusi-progettioneshot'],
  ['Interrotto', 'progettiinterrotti'],
];

const GENRES = [
  'Avventura',
  'Azione',
  'Comico',
  'Commedia',
  'Drammatico',
  'Ecchi',
  'Fantascienza',
  'Fantasy',
  'Guerra',
  'Harem',
  'Horror',
  'Isekai',
  'Mecha',
  'Mistero',
  'Musica',
  'Psicologico',
  'Scolastico',
  'Sentimentale',
  'Slice of Life',
  'Sovrannaturale',
  'Sperimentale',
  'Storico',
  'Thriller',
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

// The "serie.php" list (`div.manga`): the site keeps hrefs relative, without a leading slash.
function popularFromElement(element: HtmlElement): MangaSummary[] {
  const link = element.selectFirst('a.linkalmanga');
  if (!link) return [];
  return [
    {
      url: relativeUrl(absoluteUrl(BASE_URL, link.attr('href') ?? '')),
      title: element.selectFirst('div.nomeserie > span')?.text() ?? '',
      thumbnailUrl: absoluteUrl(BASE_URL, element.selectFirst('img')?.attr('src') ?? '') || undefined,
    },
  ];
}

// "Ultime Release" and the genre list (`.containernews > a`, `.listonegen > a`) link to a chapter or a genre page.
function latestFromElement(element: HtmlElement): MangaSummary[] {
  const href = element.attr('href') ?? '';
  const name = /[?&]nome=([^&]*)/.exec(href)?.[1];
  if (!name) return [];
  return [
    {
      url: `/progetto.php?nome=${name}`,
      title: element.selectFirst('.titolo')?.text() ?? '',
      thumbnailUrl: absoluteUrl(BASE_URL, element.selectFirst('img')?.attr('src') ?? '') || undefined,
    },
  ];
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const document = await load('/serie.php');
      return { items: document.select('div.manga').flatMap(popularFromElement), hasNextPage: false };
    },
    async getLatest(): Promise<MangaPage> {
      const document = await load('/');
      return { items: document.select('.containernews > a').flatMap(latestFromElement), hasNextPage: false };
    },
    async search(query, _page, filters): Promise<MangaPage> {
      // The site has no search: the full list is filtered by text (title and genres).
      if (query) {
        const needle = query.toLowerCase();
        const document = await load('/serie.php');
        const items = document
          .select('div.manga')
          .filter((element) => element.text().toLowerCase().includes(needle))
          .flatMap(popularFromElement);
        return { items, hasNextPage: false };
      }
      if ((typeof filters.type === 'string' ? filters.type : 'Genere') === 'Stato') {
        const selected = STATES.filter(([, id]) => filters[`state.${id}`] !== false).flatMap(([, id]) => id.split('-'));
        const document = await load('/serie.php');
        const items = selected.flatMap((id) => document.select(`.${id} > .manga`).flatMap(popularFromElement));
        return { items, hasNextPage: false };
      }
      const genre = typeof filters.genre === 'string' ? filters.genre : GENRES[0]!;
      const document = await load(`/listone.php?genere=${encodeURIComponent(genre)}`);
      return { items: document.select('.listonegen > a').flatMap(latestFromElement), hasNextPage: false };
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'La ricerca non accetta i filtri e viceversa' },
      {
        type: 'select',
        id: 'type',
        label: 'Scegli quale usare',
        options: ['Stato', 'Genere'].map((value) => ({ value, label: value })),
        default: 'Genere',
      },
      {
        type: 'group',
        id: 'state',
        label: 'Stato',
        filters: STATES.map(([label, id]) => ({ type: 'checkbox', id: `state.${id}`, label, default: true })),
      },
      {
        type: 'select',
        id: 'genre',
        label: 'Genere',
        options: GENRES.map((value) => ({ value, label: value })),
        default: GENRES[0],
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const info = document.selectFirst('.tabellaalta');
      const text = info?.text() ?? '';
      const status: MangaStatus = text.includes('In Corso')
        ? 'ongoing'
        : text.includes('Concluso')
          ? 'completed'
          : text.includes('Interrotto')
            ? 'hiatus'
            : 'unknown';
      const genres = (info?.select('span.generi > a') ?? []).map((a) => a.text());
      return {
        url: manga.url,
        title: manga.title,
        status,
        genres: genres.length ? genres : undefined,
        description:
          document
            .selectFirst('span.trama')
            ?.text()
            .replace(/^.*?Trama:\s*/, '') || undefined,
        thumbnailUrl: manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      return document
        .select('.capitoli_cont > a')
        .map((element): Chapter => {
          const name = element.text();
          return {
            url: relativeUrl(absoluteUrl(BASE_URL, element.attr('href') ?? '')).replace('/reader.php', '/readerr.php'),
            name,
            number: Number.parseFloat(name.replace(/^Capitolo /, '').trim()) || 0,
          };
        })
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      const nomemanga = document.selectFirst('#nomemanga')?.attr('class');
      const numcap = document.selectFirst('.numcap')?.text();
      const maxpag = Number.parseInt(document.selectFirst('.maxpag')?.text() ?? '', 10);
      if (nomemanga && numcap && maxpag > 0) {
        return Array.from({ length: maxpag }, (_, i) => ({
          index: i,
          imageUrl: `${BASE_URL}/${nomemanga}/cap.${numcap}/${i + 1}.jpg`,
        }));
      }
      return document
        .select('img.corrente')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.attr('src') || '' }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
    resolveUrl(url) {
      const match = /^https?:\/\/([^/?#]+)\/(progetto\.php\?nome=[^&#]+)/i.exec(url.trim());
      if (!match || match[1]?.toLowerCase().replace(/^www\./, '') !== hostOf(BASE_URL).replace(/^www\./, ''))
        return null;
      return { url: `/${match[2]}`, title: '' };
    },
  }),
});
