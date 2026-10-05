import {
  type Chapter,
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
import { FILTERS } from './filters';

const BASE_URL = 'https://falcoscan.net';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

// Reader images need the chapter's X-Falco-Token, its session cookie and the chapter as Referer; they are
// kept from the last getPages call for imageHeaders.
let reader: { token: string; cookie: string; referer: string } | undefined;

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function cards(document: HtmlElement, elements: HtmlElement[]): MangaPage {
  const seen = new Set<string>();
  const items = elements.flatMap((a): MangaSummary[] => {
    const href = a.absUrl('href');
    if (!href) return [];
    const url = relativeUrl(href);
    if (seen.has(url)) return [];
    seen.add(url);
    return [
      {
        url,
        title: a.selectFirst('.info h4')?.text() ?? '',
        thumbnailUrl: a.selectFirst('.cover img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: false };
}

const STATUS: Record<string, MangaStatus> = {
  'en emisión': 'ongoing',
  finalizado: 'completed',
  cancelado: 'cancelled',
  'en espera': 'hiatus',
};

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    // The ranking page is permanently in maintenance; the full catalogue is used instead.
    getPopular: async () => {
      const document = await load('/comics');
      return cards(document, document.select('a.falco-card'));
    },
    getLatest: async () => {
      const document = await load('/');
      const section = document
        .select('section')
        .find((s) => s.select('h2').some((h) => h.text().includes('Recientemente actualizado')));
      return cards(document, section?.select('a.falco-card') ?? []);
    },
    getFilters: () => [
      { type: 'header', label: 'NOTA: Los filtros serán ignorados si se realiza una búsqueda por texto.' },
      { type: 'header', label: 'Solo se puede aplicar un filtro a la vez.' },
      ...FILTERS,
    ],
    async search(query: string, _page: number, filters: FilterState): Promise<MangaPage> {
      const params: string[] = [];
      if (query.trim()) params.push(`search=${encodeURIComponent(query.trim())}`);
      else {
        for (const [id, param] of [
          ['alphabetic', 'filter'],
          ['genre', 'gen'],
          ['status', 'status'],
        ] as const) {
          const value = filters[id];
          if (typeof value === 'string' && value) params.push(`${param}=${encodeURIComponent(value)}`);
        }
      }
      const document = await load(`/comics${params.length ? `?${params.join('&')}` : ''}`);
      return cards(document, document.select('a.falco-card'));
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const info = (label: string) =>
        document
          .select('.info-panel .info-row')
          .find((row) => row.selectFirst('.label')?.text().trim() === label)
          ?.selectFirst('.value')
          ?.text()
          .trim() || undefined;
      const style = document.selectFirst('.series-cover')?.attr('style') ?? '';
      return {
        url: manga.url,
        title: document.selectFirst('.series-main h1')?.text() || manga.title,
        description: document.selectFirst('.series-main p.desc')?.text() || undefined,
        genres: document.select('.series-main .falco-tag').map((tag) => tag.text()),
        thumbnailUrl: /url\('([^']+)'\)/.exec(style)?.[1] || manga.thumbnailUrl,
        author: info('Autor'),
        artist: info('Artista'),
        status: STATUS[info('Status')?.toLowerCase() ?? ''] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      return document.select('a.chapter-card').map((a) => ({
        url: relativeUrl(a.absUrl('href') ?? ''),
        name: a.selectFirst('.ch-name')?.text() ?? '',
        uploadedAt: parseDate(a.selectFirst('.ch-date')?.text(), 'd/M/yyyy'),
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const chapterUrl = absoluteUrl(BASE_URL, chapter.url);
      const response = await http.get(chapterUrl, { headers });
      const document = html.load(response.body, { baseUrl: response.url });
      const canvases = document.select('#canvas-reader .cap-canvas');
      // Scrambled pages are mirrored/colour-inverted fragments the host can't reassemble.
      if (canvases.some((c) => c.attr('data-scrambled') === '1')) {
        throw new Error('Capítulo protegido (imágenes fragmentadas): no soportado');
      }
      const setCookie = Object.entries(response.headers).find(([name]) => name.toLowerCase() === 'set-cookie')?.[1];
      reader = {
        token: document.selectFirst('#canvas-reader')?.attr('data-token') ?? '',
        cookie: /falcoscan_session=[^;,\s]+/.exec(setCookie ?? '')?.[0] ?? '',
        referer: chapterUrl,
      };
      return canvases.map((canvas, index) => ({ index, imageUrl: canvas.absUrl('data-src') ?? '' }));
    },
    imageHeaders: () =>
      reader
        ? {
            'User-Agent': USER_AGENT,
            Referer: reader.referer,
            'X-Requested-With': 'XMLHttpRequest',
            'X-Falco-Token': reader.token,
            ...(reader.cookie ? { Cookie: reader.cookie } : {}),
          }
        : headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/comics\/[^/?#]+)\/?(?:[?#]|$)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
