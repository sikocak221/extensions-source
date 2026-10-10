import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://new.astratoons.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

const SORTS = [
  { label: 'Mais Recente', value: 'updated_at' },
  { label: 'Título', value: 'title' },
  { label: 'Nº de Capítulos', value: 'chapters_count' },
];
const STATUSES = [
  { label: 'Todo Status', value: '' },
  { label: 'Em dia', value: 'em dia' },
  { label: 'Em andamento', value: 'em andamento' },
  { label: 'Completo', value: 'completo' },
  { label: 'Cancelado', value: 'cancelado' },
  { label: 'Hiato', value: 'hiato' },
  { label: 'Dropado', value: 'dropado' },
];
const TYPES = ['Manga', 'Manhwa', 'Manhua', 'Webtoon'].map((t) => ({ label: t, value: t }));
const TAGS = [
  ['Ação', 'acao'], ['Artes Marciais', 'artes-marciais'], ['Aventura', 'aventura'], ['Comédia', 'comedia'],
  ['Crime', 'crime'], ['Cultivo', 'cultivo'], ['Dança', 'danca'], ['Drama', 'drama'], ['Ecchi', 'ecchi'],
  ['Esporte', 'esporte'], ['Fantasia', 'fantasia'], ['Harém', 'harem'], ['Histórico', 'historico'],
  ['Isekai', 'isekai'], ['Iskai', 'iskai'], ['Magia', 'magia'], ['Mistério', 'misterio'], ['Monstros', 'monstros'],
  ['Murim', 'murim'], ['Reencarnação', 'reencarnacao'], ['Regressão', 'regressao'], ['Romance', 'romance'],
  ['Sci-fi', 'sci-fi'], ['Seinen', 'seinen'], ['Shounen', 'shounen'], ['Silence', 'silence'],
  ['Slice of Life', 'slice-of-life'], ['Sobrenatural', 'sobrenatural'], ['Super poderes', 'super-poderes'],
  ['Suspense', 'suspense'], ['Tragédia', 'tragedia'], ['Troca de gênero', 'troca-de-genero'],
  ['Viagem no tempo', 'viagem-no-tempo'], ['Vida Cotidiana', 'vida-cotidiana'], ['Vida Escolar', 'vida-escolar'],
  ['Zumbis', 'zumbis'],
].map(([label, value]) => ({ label: label!, value: value! }));

const load = async (url: string) => html.load((await http.get(url, { headers })).body, { baseUrl: url });

interface ComicsResponse {
  data: { title: string; slug: string; cover_image: string }[];
  current_page: number;
  last_page: number;
}

async function comics(query: string): Promise<MangaPage> {
  const { body } = await http.get<ComicsResponse>(`${BASE_URL}/api/comics?${query}`, {
    headers,
    responseType: 'json',
  });
  return {
    items: body.data.map((c) => ({
      url: `/comics/${c.slug}`,
      title: c.title,
      thumbnailUrl: `${BASE_URL}/storage/${c.cover_image}`,
    })),
    hasNextPage: body.current_page < body.last_page,
  };
}

const STATUS_MAP: Record<string, MangaStatus> = {
  'em andamento': 'ongoing',
  'em dia': 'ongoing',
  completo: 'completed',
  hiato: 'hiatus',
  cancelado: 'cancelled',
  dropado: 'cancelled',
};

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const doc = await load(BASE_URL);
      return {
        items: doc.select('#comicsSlider a').map((a) => ({
          url: relativeUrl(a.absUrl('href') ?? ''),
          title: a.selectFirst('h3')?.text() ?? '',
          thumbnailUrl: a.selectFirst('img')?.absUrl('src'),
        })),
        hasNextPage: false,
      };
    },
    getLatest: (page) => comics(`sortBy=updated_at&page=${page}`),
    getFilters: (): Filter[] => [
      { type: 'select', id: 'sort', label: 'Ordenar por', options: SORTS, default: 'updated_at' },
      { type: 'select', id: 'status', label: 'Status', options: STATUSES, default: '' },
      {
        type: 'group',
        id: 'types',
        label: 'Tipos',
        filters: TYPES.map((t): Filter => ({ type: 'checkbox', id: `types.${t.value}`, label: t.label })),
      },
      {
        type: 'group',
        id: 'tags',
        label: 'Gêneros',
        filters: TAGS.map((t): Filter => ({ type: 'checkbox', id: `tags.${t.value}`, label: t.label })),
      },
    ],
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params = [`page=${page}`];
      if (query) params.push(`search=${encodeURIComponent(query)}`);
      if (typeof filters.sort === 'string') params.push(`sortBy=${encodeURIComponent(filters.sort)}`);
      if (typeof filters.status === 'string' && filters.status) params.push(`status=${encodeURIComponent(filters.status)}`);
      for (const [id, value] of Object.entries(filters)) {
        if (value !== true) continue;
        const [group, key] = id.split('.');
        if (group === 'types' || group === 'tags') params.push(`${group}[]=${key}`);
      }
      return comics(params.join('&'));
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const doc = await load(BASE_URL + manga.url);
      const text = (sel: string) => selectIgnoreCase(doc, sel)[0]?.text() || undefined;
      const status = text('h3:contains(Informações) + div span.capitalize')?.toLowerCase();
      return {
        url: manga.url,
        title: doc.selectFirst('h1')?.text() ?? manga.title,
        thumbnailUrl: doc.selectFirst('img[class*=object-cover]')?.absUrl('src') ?? manga.thumbnailUrl,
        description: doc.selectFirst('div.space-y-4 > p')?.text() || doc.selectFirst('div:has(>h1) + div')?.text(),
        genres: selectIgnoreCase(doc, 'h3:contains(Tags) + div a').map((a) => a.text()),
        author: text('span:contains(Autor) > span'),
        artist: text('span:contains(Artista) > span'),
        status: (status && STATUS_MAP[status]) || 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const doc = await load(BASE_URL + manga.url);
      const id = /comicId:\s*(\d+)/.exec(doc.html())?.[1];
      if (!id) return [];
      const chapters: Chapter[] = [];
      for (let page = 1, more = true; more; page++) {
        const { body } = await http.get<{ hasMore: boolean; html: string }>(
          `${BASE_URL}/api/comics/${id}/chapters?search=&order=desc&page=${page}`,
          { headers, responseType: 'json' },
        );
        const fragment = html.load(body.html, { baseUrl: BASE_URL });
        for (const a of fragment.select('a'))
          chapters.push({ url: relativeUrl(a.absUrl('href') ?? ''), name: a.selectFirst('.text-lg')?.text() ?? 'Chapter' });
        more = body.hasMore;
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const doc = await load(BASE_URL + chapter.url);
      return doc.select('#reader-container img[src], #reader-container canvas[data-src]').map((el, index) => ({
        index,
        imageUrl: el.absUrl('src') || el.absUrl('data-src') || '',
      }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const path = relativeUrl(url.replace(/[?#].*/, ''));
      return hostOf(url) === hostOf(BASE_URL) && /^\/comics\/[^/]+$/.test(path) ? { url: path, title: '' } : null;
    },
    getWebUrl: (item) => BASE_URL + item.url,
  }),
});
