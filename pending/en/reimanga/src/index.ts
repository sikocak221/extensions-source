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
import { USER_AGENT, absoluteUrl, findRscObject, hostOf } from './common/utils';

const BASE_URL = 'https://reimanga.net';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, Cookie: 'showAdultContent=true' };
const rscHeaders = { ...headers, rsc: '1' };

const SORTS: [string, string][] = [
  ['Latest Update', 'latest'],
  ['Newest', 'newest'],
  ['Most Viewed', 'viewed'],
  ['Top Rated', 'scored'],
  ['Title A-Z', 'title'],
];

interface MangaDto {
  id: number;
  name_url: string;
  title: string;
  cover_url?: string | null;
}

interface Tag {
  name: string;
  slug: string;
}

interface MangaDetailsDto extends MangaDto {
  description?: string | null;
  ai_description?: string | null;
  alt_title?: string | null;
  completed?: number;
  rating?: number;
  is_adult?: number;
  genres?: Tag[];
  tags?: Tag[];
  authors?: { name: string }[];
  main_manga_id?: number | null;
  main_name_url?: string | null;
}

interface ChapterList {
  manga: { id: number; name_url: string };
  chapters: { id: number; name: string; gdrive_upload_date?: string; updated_at?: string; created_at?: string }[];
}

async function getJson<T>(url: string, extra = headers): Promise<T> {
  return JSON.parse((await http.get(absoluteUrl(BASE_URL, url), { headers: extra })).body) as T;
}

const toSummary = (m: MangaDto): MangaSummary => ({
  url: `/manga/${m.name_url}-${m.id}`,
  title: m.title,
  thumbnailUrl: m.cover_url || `${BASE_URL}/covers/${m.id}/thumbnail.png`,
});

const idOf = (url: string) => Number(url.split('/')[2]?.split('-').pop());

async function browse(page: number, query: string, filters: FilterState): Promise<MangaPage> {
  const sort = (filters.sort as { value?: string; ascending?: boolean } | undefined) ?? {};
  const params = [`page=${page}`, 'limit=24'];
  if (query.trim()) params.push(`search=${encodeURIComponent(query.trim())}`);
  params.push(`sort=${sort.value ?? 'latest'}`, `order=${sort.ascending ? 'asc' : 'desc'}`);
  if (typeof filters.status === 'string' && filters.status) params.push(`status=${filters.status}`);
  const pick = (prefix: string, state: string) =>
    Object.entries(filters)
      .filter(([id, value]) => id.startsWith(`${prefix}.`) && value === state)
      .map(([id]) => id.slice(prefix.length + 1));
  const genres = pick('genre', 'include');
  const tags = pick('tag', 'include');
  const excluded = [...pick('genre', 'exclude'), ...pick('tag', 'exclude')];
  if (genres.length) params.push(`genre=${encodeURIComponent(genres.join(','))}`);
  if (tags.length) params.push(`tag=${encodeURIComponent(tags.join(','))}`);
  if (excluded.length) params.push(`excludeGenres=${encodeURIComponent(excluded.join(','))}`);
  const data = await getJson<{
    data?: MangaDto[];
    initialData?: MangaDto[];
    pagination: { currentPage: number; totalPages: number };
  }>(`/api/manga?${params.join('&')}`);
  return {
    items: (data.data ?? data.initialData ?? []).map(toSummary),
    hasNextPage: data.pagination.currentPage < data.pagination.totalPages,
  };
}

/** DMCA / duplicate entries point at a main series with the real metadata and chapters. */
async function resolvedManga(url: string): Promise<MangaDetailsDto> {
  const id = idOf(url);
  const { manga } = await getJson<{ manga: MangaDetailsDto }>(`/api/manga/${id}`);
  const mainId = manga.main_manga_id && manga.main_manga_id > 0 ? manga.main_manga_id : manga.id;
  return mainId === id ? manga : (await getJson<{ manga: MangaDetailsDto }>(`/api/manga/${mainId}`)).manga;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(page: number): Promise<MangaPage> {
      if (page > 1) return browse(page - 1, '', { sort: { value: 'viewed', ascending: false } });
      const data = await getJson<MangaDto[]>('/api/manga/trending?limit=100');
      return { items: data.map(toSummary), hasNextPage: true };
    },
    getLatest: (page) => browse(page, '', {}),
    search: (query, page, filters) => browse(page, query, filters),
    async getFilters(): Promise<Filter[]> {
      const filters: Filter[] = [
        {
          type: 'sort',
          id: 'sort',
          label: 'Sort',
          options: SORTS.map(([label, value]) => ({ label, value })),
          default: { value: 'latest', ascending: false },
        },
        {
          type: 'select',
          id: 'status',
          label: 'Status',
          options: [
            { label: 'All', value: '' },
            { label: 'Ongoing', value: 'ongoing' },
            { label: 'Completed', value: 'completed' },
          ],
          default: '',
        },
      ];
      const response = await http.request<string>({ url: `${BASE_URL}/advanced-search`, headers: rscHeaders });
      const list = findRscObject<{ genres: Tag[]; tags: Tag[] }>(
        response.body,
        (v) => Array.isArray(v.genres) && Array.isArray(v.tags),
      );
      if (!list) return filters;
      const group = (id: string, label: string, tags: Tag[]): Filter => ({
        type: 'group',
        id,
        label,
        filters: [...tags]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((t) => ({ type: 'tristate', id: `${id}.${t.slug}`, label: t.name })),
      });
      return [...filters, group('genre', 'Genres', list.genres), group('tag', 'Tags', list.tags)];
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const m = await resolvedManga(manga.url);
      const lines: string[] = [];
      if ((m.rating ?? -1) > 0) {
        const filled = Math.min(5, Math.max(0, Math.round(m.rating! / 2)));
        lines.push(`${'★'.repeat(filled)}${'☆'.repeat(5 - filled)} ${m.rating}`);
      }
      const summary = (m.ai_description ?? m.description)?.trim();
      if (summary) lines.push(summary);
      if (m.alt_title?.trim())
        lines.push(
          `Alternative Titles:\n${m.alt_title
            .split(/[,;]/)
            .map((t) => `- ${t.trim()}`)
            .join('\n')}`,
        );
      return {
        ...toSummary(m),
        description: lines.join('\n\n') || undefined,
        status: m.completed === 1 ? 'completed' : 'ongoing',
        author: (m.authors ?? []).map((a) => a.name.trim().replace(/,$/, '').trim()).join(', ') || undefined,
        genres: [
          ...(m.is_adult === 1 ? ['Adult'] : []),
          ...(m.genres ?? []).map((g) => g.name.trim()),
          ...(m.tags ?? []).map((t) => t.name.trim()),
        ],
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const m = await resolvedManga(manga.url);
      const page =
        m.main_manga_id && m.main_manga_id > 0 && m.main_name_url
          ? `/manga/${m.main_name_url}-${m.main_manga_id}`
          : `/manga/${m.name_url}-${m.id}`;
      const body = (await http.get(absoluteUrl(BASE_URL, page), { headers: rscHeaders })).body;
      const data = findRscObject<ChapterList>(body, (v) => Array.isArray(v.chapters) && typeof v.manga === 'object');
      if (!data) return [];
      return data.chapters.map((c) => {
        const date = Date.parse(c.gdrive_upload_date ?? c.updated_at ?? c.created_at ?? '');
        return {
          url: `/manga/${data.manga.name_url}-${data.manga.id}/${c.id}`,
          name: c.name.replace(/\s+/g, ' ').trim(),
          uploadedAt: Number.isNaN(date) ? undefined : date,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const body = (await http.get(absoluteUrl(BASE_URL, chapter.url), { headers: rscHeaders })).body;
      const data = findRscObject<{ images: { image_url: string }[] }>(body, (v) => Array.isArray(v.images));
      return (data?.images ?? []).map((img, index) => ({ index, imageUrl: img.image_url }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/manga\/([^/?#]+-\d+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/manga/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
