import {
  type Chapter,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, ownText, relativeUrl } from './common/utils';

const DOMAIN_URL = 'https://enchiladascan.github.io';
const BASE_URL = `${DOMAIN_URL}/enchiladaweb`;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface Catalog {
  items: { title: string; post_url: string; portada: string }[];
}

let catalog: MangaSummary[] | undefined;

async function fetchCatalog(): Promise<MangaSummary[]> {
  if (!catalog) {
    const response = await http.get(`${BASE_URL}/catalogo.json`, { headers });
    catalog = (JSON.parse(response.body) as Catalog).items.map((m) => ({
      url: m.post_url,
      title: m.title,
      thumbnailUrl: `${BASE_URL}${m.portada}`,
    }));
  }
  return catalog;
}

const STATUS: Record<string, MangaStatus> = { 'en publicación': 'ongoing', finalizado: 'completed' };

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      return { items: await fetchCatalog(), hasNextPage: false };
    },
    async search(query): Promise<MangaPage> {
      const needle = query.toLowerCase();
      return {
        items: (await fetchCatalog()).filter((m) => m.title.toLowerCase().includes(needle)),
        hasNextPage: false,
      };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const response = await http.get(`${BASE_URL}${manga.url}`, { headers });
      const document = html.load(response.body, { baseUrl: response.url });
      const container = document.selectFirst('main.container');
      if (!container) throw new Error('Manga page not found');
      const meta = (label: string) => {
        const row = container.select('.manga-meta-list > li').find((li) => li.text().includes(label));
        return row ? ownText(row) : undefined;
      };
      return {
        url: manga.url,
        title: container.selectFirst('.manga-title')?.text() ?? manga.title,
        thumbnailUrl: container.selectFirst('.manga-cover img')?.absUrl('src') || manga.thumbnailUrl,
        author: meta('Autor'),
        artist: meta('Arte'),
        genres: meta('Género')
          ?.split(',')
          .map((g) => g.trim())
          .filter(Boolean),
        status: STATUS[(meta('Estado') ?? '').toLowerCase()] ?? 'unknown',
        description: container.selectFirst('.manga-sinopsis')?.text() || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const response = await http.get(`${BASE_URL}${manga.url}`, { headers });
      const document = html.load(response.body, { baseUrl: response.url });
      return document
        .select('ul#chaptersList > li')
        .flatMap((element): Chapter[] => {
          const a = element.selectFirst('a');
          const name = element.selectFirst('.cap-title')?.text();
          if (!a || !name) return [];
          return [{ url: relativeUrl(a.absUrl('href') || a.attr('href') || ''), name }];
        })
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const segments = chapter.url.replace(/\/+$/, '').split('/');
      const mangaSlug = segments[segments.length - 2];
      const chapterSlug = segments[segments.length - 1];
      const response = await http.get(`${BASE_URL}/assets/mangas/${mangaSlug}/${chapterSlug}/images.json`, { headers });
      return (JSON.parse(response.body) as string[]).map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    // Chapter urls are paths of the domain (they start with "/enchiladaweb"), series urls paths of the base url.
    getWebUrl: (item) =>
      item.url.startsWith('/enchiladaweb/') ? `${DOMAIN_URL}${item.url}` : `${BASE_URL}${item.url}`,
    resolveUrl(url): MangaSummary | null {
      const match = /^https?:\/\/enchiladascan\.github\.io\/enchiladaweb(\/[^?#]+)/i.exec(url);
      return match && catalog?.some((m) => m.url === match[1]) ? { url: match[1]!, title: '' } : null;
    },
  }),
});
