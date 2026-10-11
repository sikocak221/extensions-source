import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://webcomicsapp.com';
const API_URL = 'https://official-website-api.webcomicsapp.com/api/web/v4/book';

const T = {
  en: {
    genreTitle: 'Genres',
    genres: [
      'All',
      'Romance',
      'Action',
      'Fantasy',
      'BL',
      'Eastern Fantasy',
      'Eastern Romance',
      'Drama',
      'GL',
      'LGBTQ+',
      'Slice of Life',
      'Comedy',
      'Horror',
      'Mystery',
      'Sci-Fi',
    ],
    statusTitle: 'Filter By',
    statuses: ['All', 'Ongoing', 'Completed'],
    sortTitle: 'Sort By',
    sorts: ['Hottest', 'Best-rated', 'Newest'],
  },
  fr: {
    genreTitle: 'Genres',
    genres: [
      'Tous',
      'Amour',
      'Action',
      'Fantaisie',
      'BL',
      'Fantaisie orientale',
      'Amour orientale',
      'Drame',
      'Comédie',
      'Science-fiction',
    ],
    statusTitle: 'Filtrer par',
    statuses: ['Tous', 'Sérialisé', 'Terminé'],
    sortTitle: 'Trier par',
    sorts: ['Top', 'Mieux notés', 'Nouveautés'],
  },
  pt: {
    genreTitle: 'Gêneros',
    genres: [
      'Todos',
      'Romance',
      'Ação',
      'Fantasia',
      'BL',
      'Fantasia Oriental Antiga',
      'Romance Oriental Antigo',
      'Drama',
      'Humor',
      'Ficção',
    ],
    statusTitle: 'Filtrar por',
    statuses: ['Todos', 'Em série', 'Concluído'],
    sortTitle: 'Ordenar por',
    sorts: ['Mais populares', 'Mais avaliados', 'Mais recentes'],
  },
  es: {
    genreTitle: 'Géneros',
    genres: [
      'Todos',
      'Romance',
      'Acción',
      'Fantasía',
      'BL',
      'Fantasía Oriental',
      'Romance Oriental',
      'Drama',
      'Comedia',
      'Ciencia Ficción',
    ],
    statusTitle: 'Filtrar por',
    statuses: ['Todos', 'En curso', 'Terminado'],
    sortTitle: 'Ordenar por',
    sorts: ['Populares', 'Mejor calificados', 'Más nuevos'],
  },
  id: {
    genreTitle: 'Genre',
    genres: [
      'Semua',
      'Romantis',
      'Aksi',
      'Fantasi',
      "Boys' Love",
      'Fantasi Asia',
      'Romantis Asia',
      'Drama',
      'Komedi',
      'Sci-Fi',
    ],
    statusTitle: 'Filter',
    statuses: ['Semua', 'Berlangsung', 'Tamat'],
    sortTitle: 'Urutkan',
    sorts: ['Terpopuler', 'Rating Tertinggi', 'Terbaru'],
  },
} as const;

const segment = (s: string) =>
  s
    .replace(/[!-/:-@[-`{-~]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
const headers = { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };

async function postApi<T>(path: string, json: unknown): Promise<T> {
  const res = await http.post<{ data: T }>(`${API_URL}${path}`, { json }, { headers, responseType: 'json' });
  return res.body.data;
}

export default defineExtension({
  createSource: (info) => {
    const lang = info.lang as keyof typeof T;
    const t = T[lang] ?? T.en;

    const listUrl = (genre: string, status: string, sort: string, page: number) =>
      `${BASE_URL}/${lang}/${segment(t.genreTitle)}/${segment(genre)}/${segment(status)}/${segment(sort)}/${page}`;

    async function parse(url: string): Promise<MangaPage> {
      const doc = html.load((await http.get(url, { headers })).body, { baseUrl: url });
      const nuxt = doc.selectFirst('script#__NUXT_DATA__')?.html() ?? '';
      const items: MangaSummary[] = [];
      for (const a of doc.select('.grid > a')) {
        const href = a.absUrl('href') ?? '';
        const segs = href.replace(/^https?:\/\/[^/]+\//, '').split('/');
        if (segs.length < 4) continue;
        const id = segs[3]!;
        let thumb = a.selectFirst('img[src]')?.absUrl('src');
        if (!thumb?.startsWith('http')) {
          thumb = new RegExp(`"${id}"[^"]*"[^"]*"[^"]*"(https[^"]+)"`).exec(nuxt)?.[1];
        }
        items.push({
          url: `/${segs[1]}/${segs[2]}/${id}`,
          title: (a.selectFirst('p.text-ink,span[class*=text]') ?? a).text().trim(),
          thumbnailUrl: thumb,
        });
      }
      return { items, hasNextPage: doc.selectFirst('div > span.cursor-default.bg-primary + a') != null };
    }

    return {
      baseUrl: BASE_URL,
      imageHeaders: () => ({ 'User-Agent': USER_AGENT }),
      getPopular: (page) => parse(listUrl(t.genres[0], t.statuses[0], t.sorts[0], page)),
      getLatest: (page) => parse(listUrl(t.genres[0], t.statuses[0], t.sorts[2], page)),
      getFilters(): Filter[] {
        const opts = (a: readonly string[]) => a.map((v) => ({ value: v, label: v }));
        return [
          { type: 'header', label: 'Filtering is ignored when searching by text.' },
          { type: 'separator' },
          { type: 'select', id: 'genre', label: t.genreTitle, options: opts(t.genres) },
          { type: 'select', id: 'status', label: t.statusTitle, options: opts(t.statuses) },
          { type: 'select', id: 'sort', label: t.sortTitle, options: opts(t.sorts) },
        ];
      },
      search(query: string, page: number, filters: FilterState) {
        if (query.trim()) return parse(`${BASE_URL}/${lang}/search?q=${encodeURIComponent(query)}`);
        const f = (k: string, d: string) => (typeof filters[k] === 'string' ? (filters[k] as string) : d);
        return parse(listUrl(f('genre', t.genres[0]), f('status', t.statuses[0]), f('sort', t.sorts[0]), page));
      },
      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        const id = manga.url.split('/').pop()!;
        const d = await postApi<{
          name: string;
          cover: string;
          category: string[];
          author: string;
          description: string;
          status: string;
        }>('/info', { book_id: id });
        return {
          url: manga.url,
          title: d.name,
          thumbnailUrl: d.cover,
          description: d.description,
          author: d.author,
          genres: d.category,
          status: d.status === t.statuses[1] ? 'ongoing' : 'completed',
        };
      },
      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        const id = manga.url.split('/').pop()!;
        const d = await postApi<{
          list: { chapter_id: string; index: number; is_pay: boolean; name: string; update_time: number }[];
        }>('/chapter/list', { book_id: id, page: 1, size: 9999, sort: 'desc' });
        return d.list.map((c) => ({
          url: `${manga.url}/${c.index}/${c.chapter_id}`,
          name: c.is_pay ? `🔒 ${c.name}` : c.name,
          number: c.index,
          uploadedAt: c.update_time,
        }));
      },
      async getPages(chapter: Chapter): Promise<Page[]> {
        const [, , , bookId, index, chapterId] = chapter.url.split('/');
        const d = await postApi<{ base_url: string; images: { url: string }[] }>('/chapter/detail', {
          book_id: bookId,
          chapter_id: chapterId,
          index: Number(index),
        });
        return d.images.map((img, i) => ({ index: i, imageUrl: d.base_url + img.url }));
      },
      getWebUrl(item) {
        const [, slug, name, id, index] = item.url.split('/');
        return `${BASE_URL}/${lang}/${slug}/${name}/${index ?? id}${index ? `/${id}` : ''}`;
      },
    };
  },
});
