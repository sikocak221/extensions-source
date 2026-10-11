import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, imgAttr, ownText, parseDate, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://exhentai.net.br';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const ALPHABET = ['Padrão', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

const load = async (url: string) => html.load((await http.get(url, { headers })).body, { baseUrl: url });

async function list(url: string, selector: string): Promise<MangaPage> {
  const doc = await load(url);
  return {
    items: doc.select(selector).map((el) => ({
      url: relativeUrl(el.selectFirst('a')?.absUrl('href') ?? ''),
      title: ownText(el.selectFirst('h3')),
      thumbnailUrl: imgAttr(el.selectFirst('img')),
    })),
    hasNextPage: doc.selectFirst('.content-pagination li.active + li:not(.next)') !== null,
  };
}

function details(doc: HtmlElement, manga: MangaSummary): MangaDetails {
  const artist = selectIgnoreCase(doc, '.ex-meta-item:has(> span:contains(Artista)) a')[0]?.text();
  return {
    url: manga.url,
    title: doc.selectFirst('.ex-manga-titles h1')?.text() ?? manga.title,
    description: doc.selectFirst('.ex-manga-synopsis .gerens-content p')?.text(),
    thumbnailUrl: imgAttr(doc.selectFirst('.ex-manga-cover-box img')) || manga.thumbnailUrl,
    artist,
    author: artist,
    genres: doc.select('.ex-tags-section a.ex-badge-tag').map((a) => a.text()),
    status: 'unknown',
  };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(`${BASE_URL}/lista-de-mangas/page/${page}`, 'article.itemP'),
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const letter = typeof filters.letter === 'string' ? filters.letter : 'Padrão';
      if (!query.trim() && letter !== 'Padrão')
        return list(`${BASE_URL}/lista-de-mangas?letra=${encodeURIComponent(letter)}`, 'article.itemP');
      return list(`${BASE_URL}/page/${page}?s=${encodeURIComponent(query)}`, '.post article.itemP');
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'Busca por título possue prioridade. Deixe em branco para pesquisar por letra' },
      {
        type: 'select',
        id: 'letter',
        label: 'Alfabeto',
        options: ALPHABET.map((l) => ({ label: l, value: l })),
        default: 'Padrão',
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      return details(await load(BASE_URL + manga.url), manga);
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const doc = await load(BASE_URL + manga.url);
      return doc.select('a.ex-chapter-row').map((a) => ({
        url: relativeUrl(a.absUrl('href') ?? ''),
        name: a.selectFirst('.ex-ch-left')?.text() ?? '',
        uploadedAt: parseDate(a.selectFirst('.ex-ch-date')?.text(), 'dd/MM/yyyy'),
      }));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const doc = await load(BASE_URL + chapter.url);
      return doc.select('div.manga_image > img').map((img, index) => ({ index, imageUrl: imgAttr(img) }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const path = relativeUrl(url.replace(/[?#].*/, ''));
      return hostOf(url) === hostOf(BASE_URL) && /^\/manga\/[^/]+\/?$/.test(path) ? { url: path, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
