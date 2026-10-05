import {
  type Chapter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl } from './common/utils';
import { FILTERS } from './filters';

const BASE_URL = 'https://heavenmanga.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const hasNext = (document: HtmlElement) => document.selectFirst('ul.pagination a[rel=next]') !== null;

function grid(document: HtmlElement): MangaPage {
  const items = document.select('div.page-item-detail').map((item): MangaSummary => ({
    url: relativeUrl(item.selectFirst('a')?.absUrl('href') ?? ''),
    title: item.selectFirst('div.manga-name')?.text() ?? '',
    thumbnailUrl: item.selectFirst('img')?.absUrl('src') || undefined,
  }));
  return { items, hasNextPage: hasNext(document) };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => grid(await load(`/top?orderby=views&pages=${page}`)),
    async getLatest(page: number): Promise<MangaPage> {
      const document = await load(page === 1 ? '/' : `/?pages=${page}`);
      const seen = new Set<string>();
      const items = document
        .select('div.col-lg-8 > div#loop-content div.list-group-item')
        .filter((item) => !item.select('div').some((div) => div.text().trim() === 'Novela'))
        .flatMap((item): MangaSummary[] => {
          const a = item.selectFirst('a');
          const href = a?.absUrl('href');
          if (!a || !href) return [];
          const mangaUrl = href.slice(0, href.lastIndexOf('/'));
          const url = relativeUrl(mangaUrl);
          if (seen.has(url)) return [];
          seen.add(url);
          return [
            {
              url,
              title: a.selectFirst('.captitle')?.text() || a.text(),
              thumbnailUrl: `${mangaUrl.replace('/manga/', '/uploads/manga/')}/cover/cover_250x350.jpg`,
            },
          ];
        });
      return { items, hasNextPage: hasNext(document) };
    },
    getFilters: () => [
      { type: 'header', label: 'NOTA: Los filtros se ignoran si se utiliza la búsqueda de texto.' },
      { type: 'header', label: 'Sólo se puede utilizar un filtro a la vez.' },
      ...FILTERS,
    ],
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const value = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');
      const pages = page > 1 ? `pages=${page}` : '';
      if (query.trim()) {
        if (query.trim().length < 3) throw new Error('La búsqueda debe tener al menos 3 caracteres');
        const document = await load(`/buscar?query=${encodeURIComponent(query.trim())}${pages ? `&${pages}` : ''}`);
        const items = document.select('div.c-tabs-item__content').map((item): MangaSummary => {
          const a = item.selectFirst('h4 a');
          return {
            url: relativeUrl(a?.absUrl('href') ?? ''),
            title: a?.text() ?? '',
            thumbnailUrl: item.selectFirst('img')?.absUrl('data-src') || undefined,
          };
        });
        return { items, hasNextPage: hasNext(document) };
      }
      let path = '';
      const query2: string[] = [];
      if (value('genre')) path += `/genero/${value('genre')}.html`;
      if (value('alphabetico')) {
        path += '/letra/manga.html';
        query2.push(`alpha=${encodeURIComponent(value('alphabetico'))}`);
      }
      if (value('listacompletas')) path += `/${value('listacompletas')}`;
      if (pages) query2.push(pages);
      return grid(await load(`${path || '/'}${query2.length ? `?${query2.join('&')}` : ''}`));
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const info = document.selectFirst('div.tab-summary');
      return {
        url: manga.url,
        title: document.selectFirst('div.post-title h1, h1')?.text().trim() || manga.title,
        genres: info?.select('div.genres-content a').map((a) => a.text()) ?? [],
        thumbnailUrl: info?.selectFirst('div.summary_image img')?.absUrl('data-src') || manga.thumbnailUrl,
        description:
          document
            .select('div.description-summary p')
            .map((p) => p.text())
            .join(' ') || undefined,
        status: 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const mangaUrl = absoluteUrl(BASE_URL, manga.url).replace(/\/$/, '');
      const params = [
        'columns[0][data]=number',
        'columns[0][orderable]=true',
        'columns[1][data]=created_at',
        'columns[1][searchable]=true',
        'order[0][column]=1',
        'order[0][dir]=desc',
        'start=0',
        'length=10000',
      ]
        .map((p) => p.replace(/\[/g, '%5B').replace(/\]/g, '%5D'))
        .join('&');
      const result = (
        await http.get<{ data: { id: number; slug: string; created_at?: string | null }[] }>(`${mangaUrl}?${params}`, {
          headers: { ...headers, 'X-Requested-With': 'XMLHttpRequest' },
          responseType: 'json',
        })
      ).body;
      return result.data
        .sort((a, b) => (Number(b.slug) || 0) - (Number(a.slug) || 0))
        .map((c) => ({
          url: `${relativeUrl(mangaUrl)}/${c.slug}#${c.id}`,
          name: `Capítulo: ${c.slug}`,
          uploadedAt: parseDate(c.created_at, 'yyyy-MM-dd HH:mm:ss'),
        }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const id = chapter.url.split('#').pop();
      if (!id || id === chapter.url) throw new Error('Error al obtener el id del capítulo. Actualice la lista');
      const body = (await http.get(`${BASE_URL}/manga/leer/${id}`, { headers })).body;
      const json = /pUrl\s*=\s*(\[[\s\S]*?\])\s*;/.exec(body)?.[1];
      if (!json) throw new Error('No se pudo extraer el JSON de las páginas');
      const pages = JSON.parse(json.replace(/,\s*(\}|\])/g, '$1')) as { imgURL: string }[];
      return pages.map((page, index) => ({ index, imageUrl: page.imgURL }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/manga\/[^/?#]+)\/?(?:[?#]|$)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
