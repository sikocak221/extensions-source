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
import { FILTERS, GENRES } from './filters';

const BASE_URL = 'https://mangalect.org';
const IMAGE_BASE_URL = `${BASE_URL.replace('https://', 'https://images.')}/file/leermangaesp`;
const PAGE_SIZE = 20;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface MangaDto {
  slug: string;
  titulo: string;
  portada?: string | null;
  fecha_publicacion?: string | null;
}

async function load(url: string): Promise<{ document: HtmlElement; url: string }> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return { document: html.load(response.body, { baseUrl: response.url }), url: response.url };
}

async function api<T>(path: string): Promise<T> {
  return (await http.get<T>(BASE_URL + path, { headers, responseType: 'json' })).body;
}

const slugOf = (url: string) => url.replace(/^\/info\//, '').replace(/\/.*$/, '');

function summaries(list: MangaDto[]): MangaSummary[] {
  return list
    .filter((m) => m.titulo.trim())
    .map((m) => {
      const cover = m.portada?.replace(/^\//, '');
      return {
        url: `/info/${m.slug}/`,
        title: m.titulo,
        thumbnailUrl: cover ? `${IMAGE_BASE_URL}/${cover}` : undefined,
      };
    });
}

function statusOf(text: string): MangaStatus {
  const value = text.toLowerCase();
  if (value.includes('en curso')) return 'ongoing';
  if (value.includes('finalizado') || value.includes('completo')) return 'completed';
  return 'unknown';
}

function chapterPage(document: HtmlElement): Chapter[] {
  return document.select('#chapter-list a.chapter-link').flatMap((a): Chapter[] => {
    if (a.attr('id') === 'continue-link' || !a.attr('data-chapter')?.trim()) return [];
    const href = a.absUrl('href');
    const name = a.selectFirst('.chapter-title')?.text().trim() || a.text().trim();
    if (!href || !name) return [];
    return [
      {
        url: relativeUrl(href),
        name,
        uploadedAt: parseDate(a.selectFirst('.chapter-date')?.text().trim(), 'MMMM d, yyyy'),
      },
    ];
  });
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const { document } = await load('/');
      const json = document.selectFirst('script#ssr-trends-data')?.html() ?? '[]';
      return { items: summaries(JSON.parse(json) as MangaDto[]), hasNextPage: false };
    },
    async getLatest(): Promise<MangaPage> {
      const list = await api<MangaDto[]>('/api/latest_chapters_with_dates');
      list.sort((a, b) => (b.fecha_publicacion ?? '').localeCompare(a.fecha_publicacion ?? ''));
      return { items: summaries(list), hasNextPage: false };
    },
    getFilters: (): Filter[] => [
      ...FILTERS,
      {
        type: 'group',
        id: 'genres',
        label: 'Géneros',
        filters: GENRES.map(([label, value]): Filter => ({ type: 'checkbox', id: `genre.${value}`, label })),
      },
    ],
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params = [`page=${page}`, `page_size=${PAGE_SIZE}`];
      if (query.trim()) params.push(`query=${encodeURIComponent(query.trim())}`);
      if (typeof filters.type === 'string' && filters.type) params.push(`tipo=${encodeURIComponent(filters.type)}`);
      const genres = Object.entries(filters)
        .filter(([id, value]) => id.startsWith('genre.') && value === true)
        .map(([id]) => id.slice(6));
      if (genres.length) params.push(`generos=${encodeURIComponent(genres.join(','))}`);
      const dto = await api<{ resultados: MangaDto[]; page: number; total_pages: number }>(
        `/api/buscar_mangas?${params.join('&')}`,
      );
      return { items: summaries(dto.resultados), hasNextPage: dto.page < dto.total_pages };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(`/info/${slugOf(manga.url)}/`);
      return {
        url: manga.url,
        title: document.selectFirst('.manga-title, h1')?.text().trim() || manga.title,
        thumbnailUrl: document.selectFirst('img.manga-cover')?.absUrl('src') || manga.thumbnailUrl,
        description: document.selectFirst('#synopsis-text')?.text().trim() || undefined,
        genres: document
          .select('.info-generos .genero-item')
          .map((g) => g.text().trim())
          .filter(Boolean),
        status: statusOf(document.selectFirst('#info-block .info-value')?.text() ?? ''),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      let { document } = await load(`/info/${slugOf(manga.url)}/`);
      const seen = new Set<string>();
      const chapters: Chapter[] = [];
      for (let guard = 0; guard < 100; guard++) {
        for (const chapter of chapterPage(document)) {
          if (!seen.has(chapter.url)) {
            seen.add(chapter.url);
            chapters.push(chapter);
          }
        }
        const next = document.selectFirst('#more-link')?.absUrl('href');
        if (!next) break;
        document = (await load(next)).document;
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { document } = await load(chapter.url);
      return document
        .select('#cascade-view img.manga-image')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') ?? '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/(?:info|manga|leer-m)\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/info/${match[2]}/`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
