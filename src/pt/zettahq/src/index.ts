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
import { USER_AGENT, hostOf, relativeUrl, selectFirstIgnoreCase } from './common/utils';

const BASE_URL = 'https://zettahq.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function load(url: string) {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function mangasPageParse(document: HtmlElement): MangaPage {
  const items = document.select('div.post-item article').map((element): MangaSummary => {
    const anchor = element.selectFirst('h3 a');
    return {
      title: anchor?.text().trim() ?? '',
      url: relativeUrl(anchor?.absUrl('href') ?? ''),
      thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined,
    };
  });
  return { items, hasNextPage: document.selectFirst('.next.page-numbers') !== null };
}

/** "Ação Violenta" → "acao-violenta", as the site's slugs. */
const normalize = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

interface Selector {
  id: string;
  label: string;
  query: string;
  priority: number;
  attr: string;
}
// Selects add their value to the url path, or to the query once a category, genre or author is in the path.
const SELECTORS: Selector[] = [
  { id: 'category', label: 'Categorias', query: 'category', priority: 3, attr: 'ofcategory' },
  { id: 'author', label: 'Autor', query: 'autor', priority: 1, attr: 'ofautor' },
  { id: 'character', label: 'Personagens', query: 'personagem', priority: 0, attr: 'ofpersonagem' },
  { id: 'parody', label: 'Paródia', query: 'parodia', priority: 0, attr: 'ofparodia' },
];
const GENRE_PRIORITY = 2;

async function getMangaDetails(path: string): Promise<MangaDetails> {
  const document = await load(BASE_URL + path);
  const author = selectFirstIgnoreCase(document, 'strong:contains(Autor) + a');
  return {
    url: path,
    title: document.selectFirst('h1')?.text().trim() ?? '',
    thumbnailUrl: document.selectFirst('.content-container article img:first-child')?.absUrl('src') || undefined,
    genres: document.select('.tags > a.tag').map((e) => e.text().trim()),
    author: author?.text().trim() || undefined,
    status: 'completed',
  };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: async (page) => mangasPageParse(await load(`${BASE_URL}/page/${page}`)),
    async getFilters(): Promise<Filter[]> {
      let document: HtmlElement;
      try {
        document = await load(`${BASE_URL}/busca-avancada/`);
      } catch {
        return [];
      }
      const filters: Filter[] = [];
      const options = (attr: string) => [
        { label: 'Todos', value: '' },
        ...document
          .select(`select[name*=${attr}] option`)
          .map((o) => ({ label: o.text().trim(), value: normalize(o.text()) })),
      ];
      for (const s of SELECTORS) {
        filters.push(
          { type: 'select', id: s.id, label: s.label, default: '', options: options(s.attr) },
          { type: 'separator' },
        );
      }
      const genres = document.select('.cat-item > label').map((l) => l.text().trim());
      filters.push({
        type: 'group',
        id: 'genres',
        label: 'Gêneros',
        filters: genres.map((g): Filter => ({ type: 'checkbox', id: `genre.${normalize(g)}`, label: g })),
      });
      return filters;
    },
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      let categoryEnabled = false;
      let genreEnabled = false;
      let authorEnabled = false;
      const path: string[] = [];
      const params: string[] = [];
      type Entry = { priority: number; apply: () => void };
      const entries: Entry[] = [];
      const genres = Object.entries(filters)
        .filter(([id, v]) => id.startsWith('genre.') && v === true)
        .map(([id]) => id.slice(6))
        .join('+');
      entries.push({
        priority: GENRE_PRIORITY,
        apply() {
          if (!genres) return;
          if (categoryEnabled) {
            params.push(`tag=${encodeURIComponent(genres)}`);
            return;
          }
          path.push('tag', genres);
          genreEnabled = !genreEnabled;
        },
      });
      for (const s of SELECTORS) {
        entries.push({
          priority: s.priority,
          apply() {
            const selected = typeof filters[s.id] === 'string' ? (filters[s.id] as string) : '';
            if (!selected.trim()) return;
            if (categoryEnabled || genreEnabled || authorEnabled) {
              params.push(`${s.query}=${encodeURIComponent(selected)}`);
              return;
            }
            path.push(s.query, selected);
            if (s.query === 'autor') authorEnabled = !authorEnabled;
            else if (s.query === 'category') categoryEnabled = !categoryEnabled;
          },
        });
      }
      // Stable sort: higher priority first, the declaration order otherwise.
      entries
        .map((entry, index) => ({ entry, index }))
        .sort((a, b) => b.entry.priority - a.entry.priority || a.index - b.index)
        .forEach(({ entry }) => entry.apply());
      const url = `${BASE_URL}/${path.map(encodeURIComponent).join('/')}${path.length ? '/' : ''}page/${page}?s=${encodeURIComponent(query)}${params.map((p) => `&${p}`).join('')}`;
      return mangasPageParse(await load(url));
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      return getMangaDetails(manga.url);
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      return [{ name: 'Capítulo Único', url: manga.url }];
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(BASE_URL + chapter.url);
      return document
        .select('.content-container article img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/[^/?#]+\/?)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
