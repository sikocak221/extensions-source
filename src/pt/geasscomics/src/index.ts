import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type SortValue,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf } from './common/utils';

const BASE_URL = 'https://geasscomics.xyz';
const API_URL = BASE_URL.replace('://', '://api.');
const PAGE_LIMIT = 24;
const PREF_ADULT = 'pref_adult_content';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

interface ChapterDto {
  id: string;
  number: number;
  title?: string | null;
  releasedAt?: string | null;
}
interface WorkDto {
  slug: string;
  title: string;
  cover?: string | null;
  coverLarge?: string | null;
  status?: string | null;
  tags?: string[];
  author?: string | null;
  synopsis?: string | null;
  chapters?: ChapterDto[];
}
interface GenreTag {
  slug: string;
  label: string;
  isNsfw?: boolean;
}

async function api<T>(path: string): Promise<T> {
  return (await http.get<{ data: T }>(API_URL + path, { headers, responseType: 'json' })).body.data;
}

const showNsfw = () => prefs.get<boolean>(PREF_ADULT) === true;

const STATUS: Record<string, MangaStatus> = {
  ongoing: 'ongoing',
  completed: 'completed',
  hiatus: 'hiatus',
  cancelled: 'cancelled',
};

const summary = (w: WorkDto): MangaSummary => ({
  url: `/manga/${w.slug}`,
  title: w.title,
  thumbnailUrl: w.coverLarge ?? w.cover ?? undefined,
});

async function works(params: string[], page: number): Promise<MangaPage> {
  const query = [`page=${page}`, `limit=${PAGE_LIMIT}`, ...(showNsfw() ? [] : ['safe=true']), ...params];
  const result = await api<{ items: WorkDto[]; page: number; pageCount: number }>(`/api/works?${query.join('&')}`);
  return { items: result.items.map(summary), hasNextPage: result.page < result.pageCount };
}

const slugOf = (url: string) => url.replace('/manga/', '');
// chapter url: /chapter/{id}/{mangaSlug}/{number}
const slugAndNumber = (url: string): [string, string] => {
  const parts = url.split('/');
  return [parts[3] ?? '', parts[4] ?? ''];
};

const SORTS = [
  { value: 'recent', label: 'Lançamentos recentes' },
  { value: 'rating', label: 'Melhor avaliados' },
  { value: 'title', label: 'Ordem alfabética' },
];

export default defineExtension({
  preferences: () => [
    {
      type: 'switch',
      key: PREF_ADULT,
      label: 'Exibir conteúdo adulto',
      description: 'Habilita a visualização de mangás Hentai nas listas.',
      default: false,
    },
  ],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => works(['sortBy=rating'], page),
    getLatest: (page) => works(['sortBy=recent'], page),
    async getFilters(): Promise<Filter[]> {
      const [genres, tags] = await Promise.all([
        api<GenreTag[]>('/api/genres').catch(() => [] as GenreTag[]),
        api<GenreTag[]>('/api/tags').catch(() => [] as GenreTag[]),
      ]);
      const nsfw = showNsfw();
      const group = (id: string, label: string, items: GenreTag[]): Filter => ({
        type: 'group',
        id,
        label,
        filters: items.map((g): Filter => ({ type: 'checkbox', id: `${id}.${g.slug}`, label: g.label })),
      });
      const select = (id: string, label: string, options: [string, string][]): Filter => ({
        type: 'select',
        id,
        label,
        default: '',
        options: options.map(([l, value]) => ({ label: l, value })),
      });
      return [
        {
          type: 'sort',
          id: 'sort',
          label: 'Ordenar por',
          options: SORTS,
          default: { value: 'recent', ascending: false },
        },
        select('type', 'Tipo', [
          ['Todos', ''],
          ['Manhwa', 'manhwa'],
          ['Mangá', 'manga'],
          ['Manhua', 'manhua'],
        ]),
        select('status', 'Status', [
          ['Todos', ''],
          ['Em lançamento', 'ongoing'],
          ['Concluído', 'completed'],
          ['Em hiato', 'hiatus'],
        ]),
        ...(genres.length || tags.length ? [{ type: 'separator' } as Filter] : []),
        ...(genres.length
          ? [
              group(
                'genre',
                'Gêneros',
                genres.filter((g) => nsfw || !g.isNsfw),
              ),
            ]
          : []),
        ...(tags.length ? [group('tag', 'Tags', tags)] : []),
      ];
    },
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params: string[] = [];
      if (query.trim()) params.push(`q=${encodeURIComponent(query.trim())}`);
      const sort = filters.sort as SortValue | undefined;
      params.push(`sortBy=${sort?.value ?? 'recent'}`, `sortDir=${sort?.ascending ? 'asc' : 'desc'}`);
      if (typeof filters.type === 'string' && filters.type) params.push(`types=${filters.type}`);
      if (typeof filters.status === 'string' && filters.status) params.push(`status=${filters.status}`);
      for (const [key, name] of [
        ['genre.', 'genres'],
        ['tag.', 'tags'],
      ] as const) {
        const ids = Object.entries(filters)
          .filter(([id, v]) => id.startsWith(key) && v === true)
          .map(([id]) => id.slice(key.length));
        if (ids.length) params.push(`${name}=${encodeURIComponent(ids.join(','))}`);
      }
      return works(params, page);
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const w = await api<WorkDto>(`/api/works/${slugOf(manga.url)}`);
      return {
        ...summary(w),
        description: w.synopsis ?? undefined,
        author: w.author?.trim() || undefined,
        genres: w.tags ?? [],
        status: STATUS[w.status ?? ''] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const slug = slugOf(manga.url);
      const w = await api<WorkDto>(`/api/works/${slug}`);
      return (w.chapters ?? []).map((c) => {
        const num = String(c.number).replace(/\.0$/, '');
        const title = c.title?.trim();
        // Older chapters use "yyyy-MM-dd HH:mm:ss" (UTC), newer ones an ISO instant.
        const released = c.releasedAt
          ? Date.parse(c.releasedAt.includes('T') ? c.releasedAt : `${c.releasedAt.replace(' ', 'T')}Z`)
          : Number.NaN;
        return {
          url: `/chapter/${c.id}/${slug}/${num}`,
          name: `Capítulo ${num}${title && !title.startsWith('Capítulo') ? ` - ${title}` : ''}`,
          number: c.number,
          uploadedAt: Number.isNaN(released) ? undefined : released,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [slug, number] = slugAndNumber(chapter.url);
      const result = await api<{ pages: string[] }>(`/api/works/${slug}/chapters/${number}`);
      return result.pages.map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/work\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/manga/${match[2]}`, title: '' } : null;
    },
    getWebUrl(item): string {
      if (item.url.startsWith('/chapter/')) {
        const [slug, number] = slugAndNumber(item.url);
        return `${BASE_URL}/read/${slug}/${number}`;
      }
      return `${BASE_URL}/work/${slugOf(item.url)}`;
    },
  }),
});
