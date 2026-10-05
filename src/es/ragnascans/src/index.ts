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

const BASE_URL = 'https://lector.ragnascan.xyz';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const GENRES = [
  'Acción',
  'Artes marciales',
  'Aventura',
  'Comedia',
  'Drama',
  'Fantasía',
  'Josie',
  'Magia',
  'Recuentos de la vida',
  'Romance',
  'Seinen',
  'Shonen',
  'Supervivencia',
  'Venganza',
  'Vida escolar',
];
const STATUSES: [string, string][] = [
  ['En emisión', 'emision'],
  ['Finalizado', 'finalizado'],
  ['Hiatus', 'hiatus'],
  ['Pausado', 'pausado'],
  ['Cancelado', 'cancelado'],
];
const TYPES: [string, string][] = [
  ['Manhwa', 'manhwa'],
  ['Manga', 'manga'],
  ['Manhua', 'manhua'],
  ['Novela', 'novela'],
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

async function directory(query: string): Promise<MangaPage> {
  const document = await load(`/directorio.php?${query}`);
  const items = document.select('.mod-grid .mod-card').map((card): MangaSummary => ({
    url: relativeUrl(card.absUrl('href') ?? ''),
    title: card.selectFirst('.mod-card-title')?.text() ?? '',
    thumbnailUrl: card.selectFirst('.mod-card-cover')?.absUrl('src') || undefined,
  }));
  return { items, hasNextPage: document.select('.mod-pg-btn').some((b) => b.text().includes('Sig')) };
}

const group = (id: string, label: string, options: [string, string][]): Filter => ({
  type: 'group',
  id,
  label,
  filters: options.map(([l, value]) => ({ type: 'checkbox', id: `${id}.${value}`, label: l })),
});

function metaValue(document: HtmlElement, label: string): HtmlElement | undefined {
  return (
    document
      .select('.meta-table .meta-row')
      .find((row) => row.selectFirst('.meta-label')?.text().toLowerCase().includes(label))
      ?.selectFirst('.meta-value') ?? undefined
  );
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => directory(`page=${page}&orden=vistas&q=`),
    getLatest: (page) => directory(`page=${page}&orden=actualizado&q=`),
    getFilters: (): Filter[] => [
      group(
        'generos',
        'Géneros',
        GENRES.map((g): [string, string] => [g, g]),
      ),
      group('estado', 'Estado', STATUSES),
      group('tipo', 'Tipo', TYPES),
      {
        type: 'select',
        id: 'orden',
        label: 'Ordenar por',
        default: 'vistas',
        options: [
          { label: 'Más recientes', value: 'actualizado' },
          { label: 'Más populares', value: 'vistas' },
          { label: 'Mejor valorados', value: 'votos' },
          { label: 'A — Z', value: 'az' },
          { label: 'Z — A', value: 'za' },
          { label: 'Recién agregados', value: 'nuevo' },
        ],
      },
    ],
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params = [`page=${page}`, `q=${encodeURIComponent(query)}`];
      for (const [id, value] of Object.entries(filters)) {
        const dot = id.indexOf('.');
        if (dot > 0 && value === true) params.push(`${id.slice(0, dot)}[]=${encodeURIComponent(id.slice(dot + 1))}`);
      }
      params.push(`orden=${typeof filters.orden === 'string' && filters.orden ? filters.orden : 'vistas'}`);
      return directory(params.join('&'));
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const info = document.select('.flex.flex-wrap.items-center.gap-x-3 span');
      const labelled = (label: string) =>
        info
          .find((span) => span.text().includes(label))
          ?.text()
          .split(label)[1]
          ?.trim() || undefined;
      const statusText = metaValue(document, 'estado')?.text().trim().toLowerCase() ?? '';
      const status: MangaStatus = ['emision', 'en emisión', 'en emision'].includes(statusText)
        ? 'ongoing'
        : statusText === 'finalizado'
          ? 'completed'
          : ['hiatus', 'pausado'].includes(statusText)
            ? 'hiatus'
            : statusText === 'cancelado'
              ? 'cancelled'
              : 'unknown';
      return {
        url: manga.url,
        title: document.selectFirst('h1')?.text() || manga.title,
        thumbnailUrl: document.selectFirst('.cover-wrapper img')?.absUrl('src') || manga.thumbnailUrl,
        author: labelled('Autor:'),
        artist: labelled('Ilustrador:'),
        description: document.selectFirst('#sinopsisWrapper p')?.text() || undefined,
        genres:
          metaValue(document, 'género')
            ?.select('a')
            .map((a) => a.text()) ?? [],
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      return document
        .select('#chaptersContainer .chapter-item')
        .filter(
          (item) => !item.attr('class')?.split(/\s+/).includes('locked-neon') && !item.selectFirst('.ph-lock-key'),
        )
        .map((item) => ({
          url: relativeUrl(item.absUrl('href') ?? ''),
          name: (item.selectFirst('.chapter-item-title h4')?.text() ?? '').replace(/\.00$/, ''),
          uploadedAt: parseDate(item.selectFirst('.chapter-item-date')?.text(), 'dd MMMM, yyyy'),
        }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      // Real urls are in data-verify: base64 of the reversed url.
      return document
        .select('#pagesContainer .page-container img')
        .flatMap((img): string[] => {
          const verify = img.attr('data-verify');
          if (verify) {
            const url = base64.decode(verify).split('').reverse().join('');
            return [url.startsWith('http') ? url : url.startsWith('//') ? `https:${url}` : BASE_URL + url];
          }
          const src = img.absUrl('src');
          return src && !src.startsWith('data:image') ? [src] : [];
        })
        .map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/manga\/[^/?#]+|\/manga\.php\?id=\d+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
