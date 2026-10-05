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
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl } from './common/utils';
import { GENRES } from './filters';

const BASE_URL = 'https://visorikigai.gettocaboca.com';
const IMAGE_CDN_URL = 'https://image2.ikigaimangas.cloud';
const NSFW_PREF = 'pref_show_nsfw';
const PAGE_SIZE = 20;
// Qwik server function behind the site's search box: returns every series in one Qwik-JSON payload.
const SERIES_QFUNC = 'dijYfob0hJw';

const showNsfw = () => prefs.get<boolean>(NSFW_PREF) === true;
const headers = () => ({
  'User-Agent': USER_AGENT,
  Referer: `${BASE_URL}/`,
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'cross-site',
  Cookie: `is-adult-enabled=${showNsfw()}`,
});

async function load(url: string, nsfw = showNsfw()): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), {
    headers: { ...headers(), Cookie: `is-adult-enabled=${nsfw}` },
  });
  return html.load(response.body, { baseUrl: response.url });
}

const slugFrom = (href: string) => href.split('/series/').pop()?.split('/')[0] ?? '';
const hasNext = (document: HtmlElement) =>
  document.selectFirst('nav[aria-label=pagination] > a:last-child:not([class*=btn-disabled])') !== null;

function cards(elements: HtmlElement[], title: string, link?: string): MangaSummary[] {
  return elements.flatMap((card): MangaSummary[] => {
    const href = link ? card.selectFirst(link)?.attr('href') : card.attr('href');
    const slug = href ? slugFrom(href) : '';
    if (!slug) return [];
    return [
      {
        url: `/series/${slug}/`,
        title: card.selectFirst(title)?.text() ?? '',
        thumbnailUrl: card.selectFirst('img')?.absUrl('src') || undefined,
      },
    ];
  });
}

interface QwikSeries {
  name: string;
  slug: string;
  cover?: string | null;
  type?: string | null;
  is_mature?: boolean;
}

/** Qwik-JSON: objects map keys to base36 indices into the flat `_objs` array. */
function qwikObjects(objs: unknown[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const entry of objs) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const resolved: Record<string, unknown> = {};
    for (const [key, ref] of Object.entries(entry as Record<string, unknown>)) {
      const index = typeof ref === 'string' ? parseInt(ref, 36) : Number.NaN;
      resolved[key] = Number.isNaN(index) ? undefined : objs[index];
    }
    out.push(resolved);
  }
  return out;
}

let seriesCache: QwikSeries[] | undefined;
async function allSeries(): Promise<QwikSeries[]> {
  if (!seriesCache) {
    const response = await http.post<{ _objs: unknown[] }>(
      `${BASE_URL}/?qfunc=${SERIES_QFUNC}`,
      `{"_entry":"1","_objs":["\\u0002_#s_${SERIES_QFUNC}",["0"]]}`,
      {
        headers: { ...headers(), 'X-QRL': SERIES_QFUNC, 'Content-Type': 'application/qwik-json' },
        responseType: 'json',
      },
    );
    seriesCache = qwikObjects(response.body._objs).filter(
      (o): o is Record<string, unknown> & QwikSeries => typeof o.name === 'string' && typeof o.slug === 'string',
    );
  }
  return seriesCache;
}

const STATUSES: [string, string][] = [
  ['Abandonada', '906428048651190273'],
  ['Cancelada', '906426661911756802'],
  ['Completa', '906409532796731395'],
  ['En Curso', '911437469204086787'],
  ['Hiatus', '906409397258190851'],
];

const STATUS: Record<string, MangaStatus> = {
  cancelada: 'cancelled',
  completa: 'completed',
  'en curso': 'ongoing',
  hiatus: 'hiatus',
};

function chapterCards(document: HtmlElement): Chapter[] {
  return document.select('section.card > ul.grid a.card').map((a) => {
    const datetime = a
      .selectFirst('time')
      ?.attr('datetime')
      ?.replace(/\s*\(.*$/, '')
      .trim();
    return {
      url: relativeUrl(a.absUrl('href') ?? ''),
      name: a.selectFirst('.card-body .card-title')?.text() ?? '',
      uploadedAt: parseDate(datetime?.replace(/ GMT([+-]\d{4})$/, ''), 'EEE MMM dd yyyy HH:mm:ss'),
    };
  });
}

export default defineExtension({
  preferences: () => [{ type: 'switch', key: NSFW_PREF, label: 'Mostrar contenido NSFW', default: false }],
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const document = await load('/clasificacion/');
      return {
        items: cards(document.select('div.grid > div.card'), '.card-body .card-title', '.card-actions > a.btn[href]'),
        hasNextPage: false,
      };
    },
    async getLatest(page: number): Promise<MangaPage> {
      const document = await load(`/?pagina=${page}`);
      return {
        items: cards(
          document.select('section[aria-labelledby=new-chapters-heading] > ul.grid:last-of-type a.card'),
          '.card-body .card-title',
        ),
        hasNextPage: hasNext(document),
      };
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'Nota: Los filtros son ignorados si se realiza una búsqueda por texto.' },
      { type: 'separator' },
      {
        type: 'sort',
        id: 'sort',
        label: 'Ordenar por',
        options: [
          { label: 'Nombre', value: 'name' },
          { label: 'Creado en', value: 'created_at' },
          { label: 'Actualización más reciente', value: 'last_chapter_date' },
          { label: 'Número de favoritos', value: 'bookmark_count' },
          { label: 'Número de valoración', value: 'rating_count' },
          { label: 'Número de vistas', value: 'view_count' },
        ],
        default: { value: 'last_chapter_date', ascending: false },
      },
      {
        type: 'group',
        id: 'statuses',
        label: 'Estados',
        filters: STATUSES.map(([label, id]): Filter => ({ type: 'checkbox', id: `status.${id}`, label })),
      },
      {
        type: 'group',
        id: 'genres',
        label: 'Géneros',
        filters: GENRES.map(([label, id]): Filter => ({ type: 'checkbox', id: `genre.${id}`, label })),
      },
    ],
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query) {
        const needle = query.toLowerCase();
        const nsfw = showNsfw();
        const matches = (await allSeries()).filter(
          (s) => s.type === 'comic' && (nsfw || !s.is_mature) && s.name.toLowerCase().includes(needle),
        );
        return {
          items: matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((s) => ({
            url: `/series/${s.slug}/`,
            title: s.name,
            thumbnailUrl: s.cover ? `${IMAGE_CDN_URL}/${s.cover.replace(/^\//, '')}` : undefined,
          })),
          hasNextPage: matches.length > page * PAGE_SIZE,
        };
      }
      const params = ['tipos%5B%5D=comic'];
      for (const [id, value] of Object.entries(filters)) {
        if (value !== true) continue;
        if (id.startsWith('genre.')) params.push(`generos%5B%5D=${id.slice(6)}`);
        if (id.startsWith('status.')) params.push(`estados%5B%5D=${id.slice(7)}`);
      }
      const sort = filters.sort as { value?: string; ascending?: boolean } | undefined;
      params.push(`ordenar=${sort?.value || 'last_chapter_date'}`, `direccion=${sort?.ascending ? 'asc' : 'desc'}`);
      params.push(`pagina=${page}`);
      const document = await load(`/series/?${params.join('&')}`);
      return {
        items: cards(document.select('section[aria-labelledby=archive-heading] > ul.grid a.card'), 'h3'),
        hasNextPage: hasNext(document),
      };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const main = (await load(manga.url)).selectFirst('main');
      return {
        url: manga.url,
        title: main?.selectFirst('.card-body .card-title')?.text() || manga.title,
        thumbnailUrl: main?.selectFirst('article.card figure > img')?.absUrl('src') || manga.thumbnailUrl,
        description: main?.selectFirst('.card-body > p')?.text() || undefined,
        status:
          STATUS[main?.selectFirst('figure > ul a[href*="?estados"]')?.text().trim().toLowerCase() ?? ''] ?? 'unknown',
        genres: main?.select('.card-body > ul > li > a[href*="?generos"]').map((a) => a.text().trim()) ?? [],
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      const chapters = chapterCards(document);
      const lastPage = Math.max(
        1,
        ...document
          .select('nav[aria-label=pagination] > a[q\\:key^="page-"]')
          .map((a) => Number(a.attr('q:key')?.split('-')[1]) || 1),
      );
      for (let page = 2; page <= lastPage; page++) {
        chapters.push(...chapterCards(await load(`${manga.url}?pagina=${page}`)));
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      let document = await load(chapter.url);
      // Mature chapters ask to allow NSFW first; the cookie lets them through.
      if (document.select('button > span').some((span) => span.text().toLowerCase().includes('permitir nsfw'))) {
        document = await load(chapter.url, true);
      }
      return document.select('section div > img').map((img, index) => ({ index, imageUrl: img.absUrl('src') ?? '' }));
    },
    imageHeaders: () => ({
      'User-Agent': USER_AGENT,
      Referer: `${BASE_URL}/`,
      'Sec-Fetch-Dest': 'image',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'cross-site',
    }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/series\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/series/${match[2]}/`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
