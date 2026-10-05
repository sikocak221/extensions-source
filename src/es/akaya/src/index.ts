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

const BASE_URL = 'https://akaya.io';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const GENRES: [string, number][] = [
  ['Acción', 9],
  ['Arte', 34],
  ['Amor entre chicos', 18],
  ['Comedia', 21],
  ['Crimen', 25],
  ['Distopía', 15],
  ['Drama', 35],
  ['Fantasía', 8],
  ['Amor entre chicas', 27],
  ['Isekai', 19],
  ['LGBTQ+', 16],
  ['Monstruos', 10],
  ['Contenido adulto', 17],
  ['Psicológico', 26],
  ['Romance', 24],
  ['Ciencia ficción', 23],
  ['Recuentos de la vida', 13],
  ['Steampunk', 20],
  ['Superhéroes', 11],
  ['Sobrenatural', 22],
  ['Suspenso', 14],
  ['Thriller', 12],
];

interface Loaded {
  document: HtmlElement;
  body: string;
  url: string;
  cookie: string;
}

async function load(url: string): Promise<Loaded> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  // Series that are gone redirect to the home page.
  if (url.startsWith('/serie') && response.url.replace(/\/$/, '') === BASE_URL) {
    throw new Error('Esta serie no se encuentra disponible');
  }
  const setCookie = Object.entries(response.headers).find(([name]) => name.toLowerCase() === 'set-cookie')?.[1] ?? '';
  return {
    document: html.load(response.body, { baseUrl: response.url }),
    body: response.body,
    url: response.url,
    cookie: /akayaio_session=[^;,\s]+/.exec(setCookie)?.[0] ?? '',
  };
}

interface LivewireCall {
  method: string;
  params: unknown[];
  metadata: Record<string, unknown>;
}

/** Runs Livewire calls on a component of a loaded page; the component's new html and snapshot. */
async function livewire(
  page: Loaded,
  snapshot: string,
  updates: Record<string, unknown>,
  calls: LivewireCall[],
): Promise<{ html: string; snapshot?: string }> {
  const updateUri = /data-update-uri="([^"]+)"/.exec(page.body)?.[1] ?? `${BASE_URL}/livewire-c4e82cae/update`;
  const token = page.document.selectFirst('meta[name=csrf-token]')?.attr('content') ?? '';
  const response = await http.post<{ components?: { snapshot?: string; effects?: { html?: string } }[] }>(
    absoluteUrl(BASE_URL, updateUri),
    { json: { _token: token, components: [{ snapshot, updates, calls }] } },
    {
      headers: {
        ...headers,
        Accept: 'application/json',
        'X-Livewire': 'true',
        'X-Requested-With': 'XMLHttpRequest',
        Origin: BASE_URL,
        Referer: page.url,
        ...(page.cookie ? { Cookie: page.cookie } : {}),
      },
      responseType: 'json',
    },
  );
  const component = response.body.components?.[0];
  return { html: component?.effects?.html ?? '', snapshot: component?.snapshot };
}

const hasNext = (document: HtmlElement) =>
  document
    .select("nav[aria-label='Pagination Navigation'] button")
    .some((b) => (b.attr('wire:click') ?? '').includes('nextPage'));

function mangaList(document: HtmlElement): MangaPage {
  const items = document.select('div[role=link]').flatMap((card): MangaSummary[] => {
    const link = card.selectFirst('a[href*="/serie/"]');
    const image = card.selectFirst('img[src*="api.akayamedia.com/content/"]');
    if (!link || !image) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') ?? ''),
        title: image.attr('alt') || card.selectFirst('h1')?.text() || '',
        thumbnailUrl: image.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: hasNext(document) };
}

/** Results rendered by a Livewire component (search box, genre filter). */
function livewireList(markup: string): MangaPage {
  const document = html.load(markup, { baseUrl: BASE_URL });
  const seen = new Set<string>();
  const items = document.select('a[href*="/serie/"]').flatMap((link): MangaSummary[] => {
    const url = relativeUrl(link.absUrl('href') ?? '');
    if (!url || seen.has(url)) return [];
    const image = link.selectFirst('img');
    const title = [
      link.selectFirst('div[data-flux-text]')?.text(),
      link.selectFirst('h1, h2, h3, h4')?.text(),
      image?.attr('alt'),
    ]
      .map((t) => (t ?? '').trim())
      .find((t) => t && t.toLowerCase() !== 'card image');
    if (!title) return [];
    seen.add(url);
    return [{ url, title, thumbnailUrl: image?.absUrl('src') || undefined }];
  });
  return { items, hasNextPage: hasNext(document) };
}

function chapterLinks(document: HtmlElement): Chapter[] {
  return document.select('#chapters-container a[href*="/chapter/"]').flatMap((a): Chapter[] => {
    const href = a.absUrl('href');
    const name = a.text().trim();
    if (!href || !name) return [];
    return [
      {
        url: relativeUrl(href),
        name,
        uploadedAt: parseDate(a.selectFirst('span.text-gray-300.text-sm')?.text().trim(), 'dd/MM/yyyy'),
      },
    ];
  });
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => mangaList((await load(`/collection/6aadb3142d515?page=${page}`)).document),
    getLatest: async (page) => mangaList((await load(`/explorer/all?page=${page}`)).document),
    getFilters: (): Filter[] => [
      { type: 'header', label: 'Los filtros se ignorarán al hacer una búsqueda por texto' },
      { type: 'separator' },
      {
        type: 'group',
        id: 'genres',
        label: 'Géneros',
        filters: GENRES.map(([label, id]): Filter => ({ type: 'checkbox', id: `genre.${id}`, label })),
      },
    ],
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query) {
        const home = await load('/');
        const snapshot = home.document.selectFirst('[wire\\:name="home.input-search"]')?.attr('wire:snapshot');
        if (!snapshot) throw new Error('No se encontró el buscador de Akaya');
        const result = await livewire(home, snapshot, { search: query }, [
          { method: '$commit', params: [], metadata: { type: 'model.live' } },
        ]);
        return livewireList(result.html);
      }
      const genres = Object.entries(filters)
        .filter(([id, value]) => id.startsWith('genre.') && value === true)
        .map(([id]) => Number(id.slice(6)));
      const explorer = await load(`/explorer/all?page=${page}`);
      if (!genres.length) return mangaList(explorer.document);
      const snapshot = explorer.document
        .select('[wire\\:snapshot]')
        .map((e) => e.attr('wire:snapshot') ?? '')
        .find((s) => s.includes('toggleGenres') || s.includes('genres'));
      if (!snapshot) throw new Error('No se encontró el filtro de géneros de Akaya');
      const result = await livewire(
        explorer,
        snapshot,
        {},
        genres.map((id) => ({ method: 'toggleGenres', params: [id], metadata: {} })),
      );
      return livewireList(result.html);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(manga.url);
      const statusText = document.selectFirst('span.text-sm.whitespace-nowrap')?.text().toLowerCase() ?? '';
      const status: MangaStatus = statusText.includes('finalizada')
        ? 'completed'
        : statusText.includes('cancelada')
          ? 'cancelled'
          : 'ongoing';
      const genreBlock = document
        .select('div')
        .find((div) => div.select('span').some((s) => s.text().trim() === 'Géneros'));
      return {
        url: manga.url,
        title:
          document.selectFirst('header.masthead > div.container > div.row .serie-head-title')?.text() || manga.title,
        author:
          [
            ...new Set(
              document
                .select('a[href*="/user/"] .truncate')
                .map((e) => e.text().trim())
                .filter(Boolean),
            ),
          ].join(', ') || undefined,
        genres: [
          ...new Set(
            genreBlock
              ?.select('ul li span')
              .map((s) => s.text().trim())
              .filter(Boolean) ?? [],
          ),
        ],
        status,
        description: document.selectFirst('p.text-gray-500.text-sm')?.text().trim() || undefined,
        thumbnailUrl:
          document.selectFirst('meta[property="og:image"]')?.attr('content')?.replace('/chapters/', '/content/') ||
          manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const page = await load(manga.url);
      const chapters = chapterLinks(page.document);
      let snapshot = page.document
        .select('[wire\\:snapshot]')
        .map((e) => e.attr('wire:snapshot') ?? '')
        .find((s) => s.includes('serie.index'));
      for (let n = 2; snapshot && n < 100; n++) {
        const result = await livewire(page, snapshot, {}, [
          { method: 'gotoPage', params: [n, 'page'], metadata: {} },
        ]).catch(() => undefined);
        if (!result?.html) break;
        const more = chapterLinks(html.load(result.html, { baseUrl: BASE_URL }));
        const before = new Set(chapters.map((c) => c.url));
        const fresh = more.filter((c) => !before.has(c.url));
        if (!fresh.length) break;
        chapters.push(...fresh);
        snapshot = result.snapshot;
      }
      // The site lists oldest first and names chapters inconsistently: number them by position.
      const unique = [...new Map(chapters.map((c) => [c.url, c])).values()].reverse();
      return unique.map((c, index) => ({ ...c, name: `Cap ${unique.length - index}`, number: unique.length - index }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document, body } = await load(chapter.url);
      const urls = document
        .select('img')
        .map((img) =>
          [img.absUrl('src'), img.absUrl('data-src'), img.absUrl('data-original'), img.absUrl('data-lazy-src')].find(
            (u) => u && (u.includes('api.akayamedia.com') || u.includes('/chapters/')),
          ),
        )
        .filter((u): u is string => Boolean(u));
      if (urls.length) return [...new Set(urls)].map((imageUrl, index) => ({ index, imageUrl }));
      const json = /var chapterData =\s*(.*?);/.exec(body)?.[1];
      if (!json) return [];
      const data = JSON.parse(json) as { images?: { image: string; order_sort?: number }[] };
      return (data.images ?? [])
        .sort((a, b) => (a.order_sort ?? 0) - (b.order_sort ?? 0))
        .map((image, index) => ({ index, imageUrl: `https://api.akayamedia.com/chapters/${image.image}` }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/serie\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL)
        ? { url: match[2]!.replace(/\/$/, ''), title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
