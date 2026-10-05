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

const BASE_URL = 'https://www.leercapitulo.co';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function cards(document: HtmlElement, item: string, link: string): MangaSummary[] {
  return document.select(item).flatMap((element): MangaSummary[] => {
    const a = element.selectFirst(link);
    const href = a?.absUrl('href');
    if (!a || !href) return [];
    return [
      { url: relativeUrl(href), title: a.text(), thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined },
    ];
  });
}

function fact(document: HtmlElement, label: string): string | undefined {
  const li = document.select('.lc-facts li').find((item) => item.selectFirst('.k')?.text().trim() === label);
  if (!li) return undefined;
  const key = li.selectFirst('.k')?.text() ?? '';
  return li.text().replace(key, '').trim() || undefined;
}

const STATUS: Record<string, MangaStatus> = {
  Ongoing: 'ongoing',
  Paused: 'hiatus',
  Completed: 'completed',
  Cancelled: 'cancelled',
};

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      return { items: cards(await load('/'), '.lc-slide', 'a.lc-slide-name'), hasNextPage: false };
    },
    async getLatest(): Promise<MangaPage> {
      return { items: cards(await load('/'), 'article.lc-release', 'a.lc-release-title'), hasNextPage: false };
    },
    getFilters: () => [
      { type: 'header', label: 'Los filtros se pueden combinar con la búsqueda por texto.' },
      ...FILTERS,
    ],
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params: string[] = [];
      if (query.trim()) params.push(`q=${encodeURIComponent(query.trim())}`);
      for (const id of ['genre', 'theme', 'type', 'status', 'sort']) {
        const value = filters[id];
        if (typeof value === 'string' && value) params.push(`${id}=${encodeURIComponent(value)}`);
      }
      if (page > 1) params.push(`page=${page}`);
      const document = await load(`/manga/${params.length ? `?${params.join('&')}` : ''}`);
      return {
        items: cards(document, 'article.lc-card', 'a.lc-card-name'),
        hasNextPage: document.selectFirst('a.page-link[rel=next]') !== null,
      };
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const title = document.selectFirst('h1')?.text() || manga.title;
      const altNames = (document.selectFirst('h1 + p.lc-muted')?.text() ?? '')
        .split(' · ')
        .filter((name) => name.trim() && name !== title)
        .join(' · ');
      const synopsis = document.selectFirst('#sinopsis p:not(.lc-muted)')?.text().trim();
      return {
        url: manga.url,
        title,
        thumbnailUrl: document.selectFirst('.lc-cover-lg img')?.absUrl('src') || manga.thumbnailUrl,
        description: [synopsis, altNames ? `Alt name(s): ${altNames}` : ''].filter(Boolean).join('\n\n') || undefined,
        genres: document
          .select("a.badge[href^='/manga/?genre='], a.badge[href^='/manga/?theme=']")
          .map((a) => a.text()),
        author: fact(document, 'Autor'),
        artist: fact(document, 'Dibujo'),
        status: STATUS[fact(document, 'Estado') ?? ''] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      return document.select('a.lc-chapter-row').map((a) => ({
        url: relativeUrl(a.absUrl('href') ?? ''),
        name: a.selectFirst('.n')?.text() ?? '',
        uploadedAt: parseDate(a.selectFirst('.d')?.text(), 'yyyy-MM-dd'),
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      return document
        .select('#lcPages img[data-src]')
        .map((img, index) => ({ index, imageUrl: img.absUrl('data-src') ?? '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/manga\/[^/?#]+\/[^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase().replace(/^www\./, '') === hostOf(BASE_URL).replace(/^www\./, '')
        ? { url: `${match[2]}/`, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
