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
import { USER_AGENT, parseDate, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://ikuhentai.net';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const GENRES: [string, string][] = [
  ['Ahegao', 'ahegao'],
  ['Anal', 'anal'],
  ['Bestiality', 'bestialidad'],
  ['Bondage', 'bondage'],
  ['Bukkake', 'bukkake'],
  ['Chicas monstruo', 'chicas-monstruo'],
  ['Chikan', 'chikan'],
  ['Colegialas', 'colegialas'],
  ['Comics porno', 'comics-porno'],
  ['Dark Skin', 'dark-skin'],
  ['Demonios', 'demonios'],
  ['Ecchi', 'ecchi'],
  ['Embarazadas', 'embarazadas'],
  ['Enfermeras', 'enfermeras'],
  ['Eroges', 'eroges'],
  ['Fantasía', 'fantasia'],
  ['Futanari', 'futanari'],
  ['Gangbang', 'gangbang'],
  ['Gemelas', 'gemelas'],
  ['Gender Bender', 'gender-bender'],
  ['Gore', 'gore'],
  ['Handjob', 'handjob'],
  ['Harem', 'harem'],
  ['Hipnosis', 'hipnosis'],
  ['Incesto', 'incesto'],
  ['Loli', 'loli'],
  ['Maids', 'maids'],
  ['Masturbación', 'masturbacion'],
  ['Milf', 'milf'],
  ['Mind Break', 'mind-break'],
  ['My Hero Academia', 'my-hero-academia'],
  ['Naruto', 'naruto'],
  ['Netorare', 'netorare'],
  ['Paizuri', 'paizuri'],
  ['Pokemon', 'pokemon'],
  ['Profesora', 'profesora'],
  ['Prostitución', 'prostitucion'],
  ['Romance', 'romance'],
  ['Straight Shota', 'straight-shota'],
  ['Tentáculos', 'tentaculos'],
  ['Virgen', 'virgen'],
  ['Yaoi', 'yaoi'],
  ['Yuri', 'yuri'],
];

const STATUSES: [string, string][] = [
  ['Completado', 'end'],
  ['En emisión', 'on-going'],
  ['Cancelado', 'canceled'],
  ['Pausado', 'on-hold'],
];

const SORTS: [string, string][] = [
  ['Relevance', ''],
  ['Latest', 'latest'],
  ['A-Z', 'alphabet'],
  ['Calificación', 'rating'],
  ['Tendencia', 'trending'],
  ['Más visto', 'views'],
  ['Nuevo', 'new-manga'],
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function imageOf(img: HtmlElement | null | undefined): string | undefined {
  if (!img) return undefined;
  return img.absUrl('data-lazy-src') || img.absUrl('src') || undefined;
}

function parseMangaList(document: HtmlElement): MangaPage {
  const items = document
    .select('div.page-listing-item .page-item-detail, div.c-tabs-item__content')
    .flatMap((element): MangaSummary[] => {
      const link = element.selectFirst('div.item-thumb > a, div.tab-thumb > a');
      if (!link) return [];
      return [
        {
          url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
          title: link.attr('title') || link.text(),
          thumbnailUrl: imageOf(element.selectFirst('img')),
        },
      ];
    });
  return { items, hasNextPage: !!document.selectFirst('a.nextpostslink, div.nav-previous > a') };
}

function toStatus(text: string): MangaStatus {
  const value = text.toLowerCase();
  if (value.includes('ongoing') || value.includes('emisión') || value.includes('emision')) return 'ongoing';
  if (value.includes('completado') || value.includes('finalizado')) return 'completed';
  return 'unknown';
}

const pagePath = (page: number) => (page > 1 ? `page/${page}/` : '');

async function search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
  const params: [string, string][] = [
    ['s', query],
    ['post_type', 'wp-manga'],
  ];
  const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string).trim() : '');
  for (const [id, value] of Object.entries(filters)) {
    if (id.startsWith('genre.') && value === 'include') params.push(['genre[]', id.slice('genre.'.length)]);
    if (id.startsWith('status.') && value === 'include') params.push(['status[]', id.slice('status.'.length)]);
  }
  if (text('sort')) params.push(['m_orderby', text('sort')]);
  if (text('author')) params.push(['author', text('author')]);
  if (text('release')) params.push(['release', text('release')]);
  const queryString = params.map(([k, v]) => `${k.replace(/%5B%5D/g, '[]')}=${encodeURIComponent(v)}`).join('&');
  return parseMangaList(await load(`${BASE_URL}/${pagePath(page)}?${queryString}`));
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) =>
      parseMangaList(await load(`${BASE_URL}/${pagePath(page)}?s=&post_type=wp-manga&m_orderby=views`)),
    getLatest: async (page) =>
      parseMangaList(await load(`${BASE_URL}/${pagePath(page)}?s=&post_type=wp-manga&m_orderby=latest`)),
    search,
    getFilters: (): Filter[] => [
      { type: 'text', id: 'author', label: 'Autor' },
      { type: 'text', id: 'release', label: 'Año de publicación' },
      {
        type: 'select',
        id: 'sort',
        label: 'Ordenar por',
        options: SORTS.map(([label, value]) => ({ label, value })),
        default: '',
      },
      {
        type: 'group',
        id: 'status',
        label: 'Estado',
        filters: STATUSES.map(([label, value]) => ({ type: 'tristate', id: `status.${value}`, label })),
      },
      {
        type: 'group',
        id: 'genre',
        label: 'Genres',
        filters: GENRES.map(([label, value]) => ({ type: 'tristate', id: `genre.${value}`, label })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(`${BASE_URL}${manga.url}`);
      const info = document.selectFirst('div.site-content') ?? document;
      const statusText = selectIgnoreCase(info, 'div.post-content_item:has(h5:contains(Estado)) div.summary-content')
        .map((e) => e.text())
        .join(' ');
      return {
        url: manga.url,
        title: manga.title,
        author:
          info
            .select('div.author-content')
            .map((e) => e.text())
            .join(' ') || undefined,
        artist:
          info
            .select('div.artist-content')
            .map((e) => e.text())
            .join(' ') || undefined,
        genres: info.select('div.genres-content a').map((a) => a.text()),
        status: toStatus(statusText),
        description:
          document
            .select('div.description-summary')
            .map((e) => e.text())
            .join(' ') || undefined,
        thumbnailUrl: imageOf(document.selectFirst('div.summary_image img')) ?? manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const url = `${BASE_URL}${manga.url}`.replace(/\/+$/, '');
      const response = await http.post(`${url}/ajax/chapters/`, { form: {} }, { headers });
      const document = html.load(response.body, { baseUrl: BASE_URL });
      return document.select('li.wp-manga-chapter').flatMap((element): Chapter[] => {
        const link = element.selectFirst('a');
        if (!link) return [];
        const href = (link.absUrl('href') || link.attr('href') || '').replace(/[?&]style=[^&#]*/, '');
        const date = element.selectFirst('span.chapter-release-date i')?.text();
        return [
          {
            url: `${relativeUrl(href)}${href.includes('?') ? '&' : '?'}style=list`,
            name: link.text(),
            uploadedAt: date ? parseDate(date, 'MMMM d, yyyy') : undefined,
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(`${BASE_URL}${chapter.url}`);
      return document
        .select('div.reading-content * img')
        .map((img) => img.absUrl('data-lazy-src') || img.absUrl('src'))
        .filter(Boolean)
        .map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
    resolveUrl(url): MangaSummary | null {
      const slug = /^https?:\/\/(?:www\.)?ikuhentai\.net\/mangas-hentai\/([^/?#]+)/i.exec(url)?.[1];
      return slug ? { url: `/mangas-hentai/${slug}/`, title: '' } : null;
    },
  }),
});
