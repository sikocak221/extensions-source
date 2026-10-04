import {
  type Chapter,
  type Filter,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf } from './common/utils';

const BASE_URL = 'https://atsu.moe';
const BROWSE_LIMIT = 40;
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/`, Accept: '*/*' };
const TYPES_QUERY = '&types=Manga,Manwha,Manhua,OEL&mediums=Comic';

const ADULT_PREFERENCE: Preference = {
  type: 'switch',
  key: 'pref_18_mode',
  label: 'Adult mode (+18)',
  default: false,
};

const SORTS: [string, string][] = [
  ['Popularity', 'views'],
  ['Trending', 'trending'],
  ['Date Added', 'dateAdded'],
  ['Release Date', 'released'],
  ['Top Rated', 'mbRating'],
  ['Title', 'title'],
];

type Named = string | { name?: string; type?: string };

interface MangaDto {
  id: string;
  title: string;
  poster?: unknown;
  image?: unknown;
  largeImage?: string | null;
  authors?: Named[] | null;
  synopsis?: string | null;
  genres?: Named[] | null;
  tags?: Named[] | null;
  released?: number | null;
  status?: string | null;
  type?: string | null;
  views?: string | number | null;
  otherNames?: string[] | null;
  avgRating?: number | null;
  scanlators?: { id: string; name: string }[] | null;
}

interface ChapterDto {
  id: string;
  number: number;
  title: string;
  scanlationMangaId?: string | null;
  createdAt?: string | number | null;
}

interface FilterData {
  genres?: { id: string; name: string }[] | null;
  tags?: { id: string; name: string }[] | null;
  types?: { id: string; name: string }[] | null;
  statuses?: { id: string; name: string }[] | null;
}

async function getJson<T>(url: string): Promise<T> {
  return JSON.parse((await http.get(absoluteUrl(BASE_URL, url), { headers })).body) as T;
}

const adult = () => (prefs.get<boolean>(ADULT_PREFERENCE.key) ? '&adult=1' : '');

function image(m: MangaDto): string | undefined {
  const raw = m.poster ?? m.image;
  let path =
    m.largeImage ??
    (typeof raw === 'string'
      ? raw
      : raw && typeof raw === 'object'
        ? ((raw as Record<string, string>).largeImage ?? (raw as Record<string, string>).image)
        : undefined);
  if (!path) return undefined;
  path = path.replace(/^\//, '').replace(/^static\//, '');
  const url = path.startsWith('http') ? path : path.startsWith('//') ? `https:${path}` : `${BASE_URL}/static/${path}`;
  return url.replace(/^https?:?\/\//, 'https://');
}

const toSummary = (m: MangaDto): MangaSummary => ({ url: `/manga/${m.id}`, title: m.title, thumbnailUrl: image(m) });

const names = (list: Named[] | null | undefined) =>
  (list ?? []).flatMap((n) => (typeof n === 'string' ? [n] : n.name ? [n.name] : []));

function status(text: string | null | undefined): MangaStatus {
  switch (text?.trim().toLowerCase()) {
    case 'ongoing':
      return 'ongoing';
    case 'completed':
      return 'completed';
    case 'hiatus':
      return 'hiatus';
    case 'canceled':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

const idOf = (url: string) => url.split('/')[2] ?? '';

async function browse(path: string): Promise<MangaPage> {
  const data = await getJson<{ items: MangaDto[] }>(path);
  return { items: data.items.map(toSummary), hasNextPage: true };
}

export default defineExtension({
  preferences: () => [ADULT_PREFERENCE],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) =>
      browse(
        `/api/home2/popular?offset=${(page - 1) * BROWSE_LIMIT}&limit=${BROWSE_LIMIT}${TYPES_QUERY}&timeframe=daily${adult()}`,
      ),
    getLatest: (page) =>
      browse(
        `/api/home2/recentlyUpdated?offset=${(page - 1) * BROWSE_LIMIT}&limit=${BROWSE_LIMIT}${TYPES_QUERY}${adult()}`,
      ),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const pick = (prefix: string, state: unknown) =>
        Object.entries(filters)
          .filter(([id, v]) => id.startsWith(`${prefix}.`) && v === state)
          .map(([id]) => id.slice(prefix.length + 1));
      const filterBy = ['hidden:!=true'];
      const includedGenres = pick('genre', 'include');
      const excludedGenres = pick('genre', 'exclude');
      const includedTags = pick('tag', 'include');
      const excludedTags = pick('tag', 'exclude');
      const types = pick('type', true);
      const statuses = pick('status', true);
      if (includedGenres.length) filterBy.push(includedGenres.map((g) => `genreIds:=\`${g}\``).join(' && '));
      if (excludedGenres.length) filterBy.push(`genreIds:!=[${excludedGenres.map((g) => `\`${g}\``).join(',')}]`);
      if (includedTags.length) filterBy.push(includedTags.map((t) => `tagIds:=\`${t}\``).join(' && '));
      if (excludedTags.length) filterBy.push(`tagIds:!=[${excludedTags.map((t) => `\`${t}\``).join(',')}]`);
      if (types.length) filterBy.push(`type:=[${types.map((t) => `\`${t}\``).join(',')}]`);
      if (statuses.length) filterBy.push(`status:=[${statuses.map((s) => `\`${s}\``).join(',')}]`);
      const year = Number.parseInt(typeof filters.year === 'string' ? filters.year : '', 10);
      if (!Number.isNaN(year)) filterBy.push(`releaseYear:=[${year}]`);
      const minChapters = Number.parseInt(typeof filters.min_chapters === 'string' ? filters.min_chapters : '', 10);
      if (!Number.isNaN(minChapters)) filterBy.push(`chapterCount:>=${minChapters}`);
      const showAdult = filters.adult === true || adult() !== '';
      if (!showAdult) filterBy.push('isAdult:=false');
      if (filters.official === true) filterBy.push('officialTranslation:=true');
      filterBy.push(
        '(mbContentRating:=[`Safe`,`Suggestive`,`Erotica`] || mbContentRating:!=*)',
        'medium:!=[`Novel`]',
        'views:>0',
      );
      const params = [
        `q=${encodeURIComponent(query.trim() || '*')}`,
        `filter_by=${encodeURIComponent(filterBy.join(' && '))}`,
      ];
      const sort = filters.sort as { value?: string; ascending?: boolean } | undefined;
      params.push(`sort_by=${encodeURIComponent(`${sort?.value ?? 'views'}:${sort?.ascending ? 'asc' : 'desc'}`)}`);
      if (query.trim())
        params.push('query_by=title,englishTitle,otherNames,authors', 'query_by_weights=4,3,2,1', 'num_typos=4,3,2,1');
      params.push(`page=${page}`, 'per_page=40');
      const body = (await http.get(`${BASE_URL}/collections/manga/documents/search?${params.join('&')}`, { headers }))
        .body;
      if (body.includes('"hits"')) {
        const data = JSON.parse(body) as {
          page: number;
          found: number;
          hits: { document: MangaDto }[];
          request_params: { per_page: number };
        };
        return {
          items: data.hits.map((h) => toSummary(h.document)),
          hasNextPage: data.page * data.request_params.per_page < data.found,
        };
      }
      return { items: (JSON.parse(body) as { items: MangaDto[] }).items.map(toSummary), hasNextPage: true };
    },
    async getFilters(): Promise<Filter[]> {
      const filters: Filter[] = [];
      try {
        const data = await getJson<FilterData>('/api/explore/availableFilters');
        const group = (
          id: string,
          label: string,
          items: { id: string; name: string }[],
          kind: 'tristate' | 'checkbox',
        ): Filter => ({
          type: 'group',
          id,
          label,
          filters: items.map((i) => ({ type: kind, id: `${id}.${i.id}`, label: i.name })),
        });
        if (data.genres?.length) filters.push(group('genre', 'Genres', data.genres, 'tristate'));
        if (data.tags?.length)
          filters.push(
            group(
              'tag',
              'Tags',
              [...data.tags].sort((a, b) => a.name.localeCompare(b.name)),
              'tristate',
            ),
          );
        if (data.types?.length) filters.push(group('type', 'Manga Type', data.types, 'checkbox'));
        if (data.statuses?.length) filters.push(group('status', 'Publishing Status', data.statuses, 'checkbox'));
      } catch {
        // The fetched filters are optional.
      }
      return [
        ...filters,
        { type: 'text', id: 'year', label: 'Year (e.g., 2024)' },
        { type: 'text', id: 'min_chapters', label: 'Minimum Chapters' },
        {
          type: 'sort',
          id: 'sort',
          label: 'Sort By',
          options: SORTS.map(([label, value]) => ({ label, value })),
          default: { value: 'views', ascending: false },
        },
        { type: 'checkbox', id: 'adult', label: 'Show Adult Content' },
        { type: 'checkbox', id: 'official', label: 'Only Official Translations' },
      ];
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { mangaPage: m } = await getJson<{ mangaPage: MangaDto }>(`/api/manga/page?id=${idOf(manga.url)}`);
      const lines: string[] = [];
      if (m.avgRating && m.avgRating > 0) lines.push(`Rating: ${m.avgRating.toFixed(2)}/10`);
      if (m.released && m.released > 0) lines.push(`Year: ${new Date(m.released).getFullYear()}`);
      if (m.views != null) lines.push(`Views: ${m.views}`);
      if (m.synopsis?.trim()) lines.push('', `Synopsis: ${m.synopsis}`);
      const others = (m.otherNames ?? []).filter((n) => n !== m.title);
      if (others.length) lines.push('', `Alternative Names:\n${others.map((n) => `- ${n}`).join('\n')}`);
      const authors = (m.authors ?? []).map((a) => (typeof a === 'string' ? { name: a, type: undefined } : a));
      return {
        ...toSummary(m),
        description: lines.join('\n').trim() || undefined,
        genres: [...(m.type ? [m.type] : []), ...names(m.genres ?? m.tags)],
        author:
          authors
            .filter((a) => a.type === 'Author' || a.type == null)
            .map((a) => a.name)
            .join(', ') || undefined,
        artist:
          authors
            .filter((a) => a.type === 'Artist')
            .map((a) => a.name)
            .join(', ') || undefined,
        status: status(m.status),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const id = idOf(manga.url);
      const [{ mangaPage }, { chapters }] = await Promise.all([
        getJson<{ mangaPage: MangaDto }>(`/api/manga/page?id=${id}`),
        getJson<{ chapters: ChapterDto[] }>(`/api/manga/allChapters?mangaId=${id}`),
      ]);
      const scanlators = new Map((mangaPage.scanlators ?? []).map((s) => [s.id, s.name]));
      return chapters
        .map((c): Chapter => {
          const date =
            typeof c.createdAt === 'number' ? c.createdAt : c.createdAt ? Date.parse(c.createdAt) : Number.NaN;
          return {
            url: `/read/${id}/${c.id}`,
            name: c.title,
            number: c.number,
            scanlator: c.scanlationMangaId ? scanlators.get(c.scanlationMangaId) : undefined,
            uploadedAt: Number.isNaN(date) ? undefined : date,
          };
        })
        .sort(
          (a, b) =>
            (b.number ?? 0) - (a.number ?? 0) ||
            (a.scanlator ?? '').localeCompare(b.scanlator ?? '') ||
            (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0),
        );
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [, , mangaId, chapterId] = chapter.url.split('/');
      const data = await getJson<{ readChapter: { pages: { image: string }[] } }>(
        `/api/read/chapter?mangaId=${mangaId}&chapterId=${chapterId}`,
      );
      return data.readChapter.pages.map((p, index) => {
        const url = p.image.startsWith('http')
          ? p.image
          : p.image.startsWith('//')
            ? `https:${p.image}`
            : `${BASE_URL}/static/${p.image.replace(/^\//, '').replace(/^static\//, '')}`;
        return { index, imageUrl: url.replace(/^https?:?\/\//, 'https://cdn.') };
      });
    },
    imageHeaders: () => ({ ...headers, Accept: 'image/avif,image/webp,*/*' }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/manga\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/manga/${match[2]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
