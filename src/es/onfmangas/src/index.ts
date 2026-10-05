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
import { absoluteUrl, hostOf, parseDate, relativeUrl } from './common/utils';
import { GENRES, TABS } from './filters';

const BASE_URL = 'https://onfmangas.com';
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: `${BASE_URL}/`,
};

async function load(url: string): Promise<{ document: HtmlElement; body: string }> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  // The site sometimes answers with a JS cookie check ("Verificando…") the sandbox can't run.
  if (response.body.length < 8192 && response.body.includes('Verificando')) {
    throw new Error('ONF Mangas pide una verificación del navegador; ábrelo en la web e inténtalo de nuevo');
  }
  return { document: html.load(response.body, { baseUrl: response.url }), body: response.body };
}

/** `const <name> = "<hex>";` → the UTF-8 JSON it encodes. */
function hexJson<T>(body: string, name: string): T | undefined {
  const hex = new RegExp(`const ${name} = "([0-9a-fA-F]*)";`).exec(body)?.[1];
  if (!hex) return undefined;
  const bytes: number[] = new Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return JSON.parse(utf8.decode(bytes)) as T;
}

function mangaGrid(document: HtmlElement): MangaPage {
  const items = document.select('.manga-grid .manga-card').flatMap((card): MangaSummary[] => {
    const title = card.selectFirst('.manga-title')?.text();
    const href = card.selectFirst('a')?.absUrl('href');
    if (!title || !href) return [];
    return [
      { url: relativeUrl(href), title, thumbnailUrl: card.selectFirst('.card-cover img')?.absUrl('src') || undefined },
    ];
  });
  return {
    items,
    hasNextPage: document.select('.pagination a.page-btn').some((a) => a.text().includes('Siguiente')),
  };
}

interface ChapterDto {
  url: string;
  titulo_str?: string | null;
  numero?: string | null;
  fecha_subida?: string | null;
  grupos_list?: { nombre: string }[] | null;
  otras_versiones?: ChapterDto[] | null;
}

function toChapter(dto: ChapterDto, parent?: ChapterDto, uploadedAt?: number): Chapter {
  const number = dto.numero ?? parent?.numero;
  return {
    url: dto.url,
    name: dto.titulo_str ?? parent?.titulo_str ?? (number ? `Capítulo ${number}` : 'Capítulo sin número'),
    number: Number(dto.numero) || undefined,
    scanlator: dto.grupos_list?.map((g) => g.nombre).join(' & ') || undefined,
    uploadedAt,
  };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const { document } = await load('/populares.php');
      const items = document.select('a.pop-podium-card, a.pop-card').flatMap((a): MangaSummary[] => {
        const title = a.selectFirst('.pop-podium-name, .pop-name')?.text();
        const href = a.absUrl('href');
        return title && href
          ? [{ url: relativeUrl(href), title, thumbnailUrl: a.selectFirst('img')?.absUrl('src') || undefined }]
          : [];
      });
      return { items, hasNextPage: false };
    },
    getLatest: async (page) => mangaGrid((await load(`/mangas.php?tab=general&genero=0&q=&page=${page}`)).document),
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'tab',
        label: 'Categoría principal',
        default: 'general',
        options: TABS.map(([label, value]) => ({ label, value })),
      },
      {
        type: 'select',
        id: 'genre',
        label: 'Género',
        default: '0',
        options: GENRES.map(([label, value]) => ({ label, value })),
      },
    ],
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const tab = typeof filters.tab === 'string' && filters.tab ? filters.tab : 'general';
      const genre = typeof filters.genre === 'string' && filters.genre ? filters.genre : '0';
      const params = [`q=${encodeURIComponent(query)}`, `page=${page}`, `tab=${tab}`];
      if (genre !== '0') params.push(`generos%5B0%5D=${genre}`);
      return mangaGrid((await load(`/mangas.php?${params.join('&')}`)).document);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(manga.url);
      const statusText = document.select('.manga-meta span').at(-1)?.text().toUpperCase() ?? '';
      const status: MangaStatus = statusText.includes('EMISIÓN')
        ? 'ongoing'
        : statusText.includes('FINALIZADO')
          ? 'completed'
          : 'unknown';
      return {
        url: manga.url,
        title: document.selectFirst('.manga-title')?.text() || manga.title,
        author: document.selectFirst('.author-link')?.text() || undefined,
        description: document.selectFirst('.manga-description')?.text() || undefined,
        genres: document.select('.genre-tag').map((g) => g.text()),
        thumbnailUrl: document.selectFirst('.manga-poster')?.absUrl('src') || manga.thumbnailUrl,
        status,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { body } = await load(manga.url);
      const list = hexJson<ChapterDto[]>(body, '_hex') ?? [];
      list.sort(
        (a, b) =>
          (Number(b.numero) || 0) - (Number(a.numero) || 0) ||
          (b.fecha_subida ?? '').localeCompare(a.fecha_subida ?? ''),
      );
      return list.flatMap((dto) => {
        const date = parseDate(dto.fecha_subida, 'yyyy-MM-dd HH:mm:ss');
        return [toChapter(dto, undefined, date), ...(dto.otras_versiones ?? []).map((v) => toChapter(v, dto, date))];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const { body } = await load(chapter.url);
      const pages = hexJson<{ src: string; fallback?: string | null }[]>(body, '_hexP') ?? [];
      // `src` is often a MangaDex@Home node url that expires; the fallback (uploads.mangadex.org) lasts.
      return pages.map((p, index) => ({ index, imageUrl: p.fallback || p.src }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/manga\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
