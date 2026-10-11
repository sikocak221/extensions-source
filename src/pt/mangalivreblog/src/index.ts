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
import { USER_AGENT, hostOf, relativeUrl } from './common/utils';

const BASE_URL = 'https://mangalivre.blog';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const RATINGS: [string, string][] = [
  ['Qualquer avaliação', '0'],
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n): [string, string] => [`${n} ou mais`, String(n)]),
];
const SORTS: [string, string][] = [
  ['Título', 'title'],
  ['Data de adição', 'date'],
  ['Avaliação', 'rating'],
];
const ORDERS: [string, string][] = [
  ['Crescente', 'asc'],
  ['Decrescente', 'desc'],
];

const select = (id: string, label: string, options: [string, string][]): Filter => ({
  type: 'select',
  id,
  label,
  default: options[0]![1],
  options: options.map(([l, value]) => ({ label: l, value })),
});

async function load(url: string) {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const cleanThumbnail = (url: string | undefined) => url?.replace('-150x150', '') || undefined;

function fromCard(el: HtmlElement): MangaSummary {
  const link = el.selectFirst('h3 a');
  return {
    title: link?.text().trim() ?? '',
    url: relativeUrl(link?.absUrl('href') ?? ''),
    thumbnailUrl: cleanThumbnail(el.selectFirst('img')?.absUrl('src')),
  };
}

function parseStatus(status: string): MangaStatus {
  if (status === 'Em Lançamento' || status === 'Em Andamento') return 'ongoing';
  if (status === 'Completo') return 'completed';
  if (status === 'Cancelado') return 'cancelled';
  if (status === 'Pausado' || status === 'Hiato') return 'hiatus';
  return 'unknown';
}

function relativeDatePt(text: string | undefined): number | undefined {
  const number = Number(/\d+/.exec(text ?? '')?.[0]);
  if (!text || !number) return undefined;
  const t = text.toLowerCase();
  const date = new Date();
  if (t.includes('ano')) date.setFullYear(date.getFullYear() - number);
  else if (t.includes('mês') || t.includes('mes')) date.setMonth(date.getMonth() - number);
  else if (t.includes('semana')) date.setDate(date.getDate() - number * 7);
  else if (t.includes('dia')) date.setDate(date.getDate() - number);
  else if (t.includes('hora')) date.setHours(date.getHours() - number);
  else if (t.includes('minuto')) date.setMinutes(date.getMinutes() - number);
  else return undefined;
  return date.getTime();
}

function parseChapters(root: HtmlElement): Chapter[] {
  return root.select('.chapters-list .chapter-item').map((el) => ({
    name: el.selectFirst('.chapter-number')?.text().trim() || 'Capítulo',
    url: relativeUrl(el.selectFirst('.chapter-link')?.absUrl('href') ?? ''),
    uploadedAt: relativeDatePt(el.selectFirst('.chapter-date')?.text()),
  }));
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(page): Promise<MangaPage> {
      const document = await load(`${BASE_URL}/manga/page/${page}/?ordem=popular`);
      return {
        items: document.select('.manga-archive-grid article.home-manga-card').map(fromCard),
        hasNextPage: document.selectFirst('.manga-archive-pagination a.next') !== null,
      };
    },
    async getLatest(page): Promise<MangaPage> {
      const document = await load(`${BASE_URL}/?atualizacoes=${page}`);
      return {
        items: document.select('.home-latest-grid article.home-manga-card').map(fromCard),
        hasNextPage: document.selectFirst('.home-latest-pagination span.is-current + a') !== null,
      };
    },
    getFilters: (): Filter[] => [
      select('rating_min', 'Avaliação Mínima', RATINGS),
      select('sort', 'Ordenar por', SORTS),
      select('order', 'Ordem', ORDERS),
    ],
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params = [`s=${encodeURIComponent(query)}`];
      for (const key of ['rating_min', 'sort', 'order']) {
        const v = filters[key];
        if (typeof v === 'string' && v) params.push(`${key}=${encodeURIComponent(v)}`);
      }
      if (page > 1) params.push(`paged=${page}`);
      const document = await load(`${BASE_URL}${query ? '' : '/pesquisa'}/?${params.join('&')}`);
      const items = document.select('.manga-grid.search-results-grid .manga-card').map((el): MangaSummary => {
        const img = el.selectFirst('img');
        return {
          // The advanced search page renders every card title as "pesquisa".
          title: img?.attr('alt') || el.selectFirst('h3.manga-card-title')?.text().trim() || '',
          url: relativeUrl(el.selectFirst('a.manga-card-link')?.absUrl('href') ?? ''),
          thumbnailUrl: cleanThumbnail(img?.absUrl('src')),
        };
      });
      return { items, hasNextPage: document.selectFirst('a.next.page-numbers') !== null };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(BASE_URL + manga.url);
      const details: MangaDetails = {
        url: manga.url,
        title: document.selectFirst('h1.manga-title')?.text().trim() ?? manga.title,
        thumbnailUrl: document.selectFirst('.manga-cover img')?.absUrl('src') || manga.thumbnailUrl,
        description: document.selectFirst('.synopsis-content')?.text().trim(),
        genres: document.select('.manga-tags a').map((e) => e.text().trim()),
        status: 'unknown',
      };
      for (const item of document.select('.manga-meta-item')) {
        const label = item.selectFirst('.meta-label')?.text().trim();
        const value = item.selectFirst('.meta-value')?.text().trim();
        if (!label || !value) continue;
        if (label === 'Status:') details.status = parseStatus(value);
        else if (label === 'Autor:') details.author = value;
        else if (label === 'Artista:') details.artist = value;
      }
      return details;
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(BASE_URL + manga.url);
      const container = document.selectFirst('.chapters-container');
      if (!container) return [];
      const pageSize = Number(container.attr('data-page-size')) || 12;
      const total = Number(container.attr('data-total-chapters')) || 0;
      const pages = Math.ceil(total / pageSize);
      const chapters = parseChapters(container);
      for (let page = 2; page <= pages; page++) {
        const url =
          `${container.attr('data-ajax-url')}?action=slimeread_manga_chapters` +
          `&manga_id=${encodeURIComponent(container.attr('data-manga-id') ?? '')}` +
          `&nonce=${encodeURIComponent(container.attr('data-nonce') ?? '')}&page=${page}&search=`;
        const response = await http.get<{ data: { markup: string } }>(url, { headers, responseType: 'json' });
        chapters.push(...parseChapters(html.load(response.body.data.markup, { baseUrl: BASE_URL })));
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(BASE_URL + chapter.url);
      return document
        .select('.chapter-image-container img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/manga\/[^/?#]+\/?)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
