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
import { USER_AGENT, absoluteUrl } from './common/utils';

const BASE_URL = 'https://wamanga.ru';
const PAGE_SIZE = 24;
const SVELTE_DATA_SUFFIX = '__data.json?x-sveltekit-invalidated=001';
const NOT_AVAILABLE = 'N/A';
const headers = { 'User-Agent': USER_AGENT, Accept: '*/*' };

const SORTS = [
  ['updatedAt', 'Обновлениям'],
  ['likes', 'Лайкам'],
  ['createdAt', 'Новизне'],
  ['views', 'Просмотрам'],
  ['alphabetical', 'Алфавиту'],
] as const;
const TYPES: [string, string][] = [
  ['manga', 'Манга'],
  ['manhwa', 'Манхва'],
  ['manhua', 'Манхуа'],
  ['comic', 'Комикс'],
  ['manuscript', 'Рукопись'],
];
const STATUSES: [string, string][] = [
  ['ongoing', 'Онгоинг'],
  ['completed', 'Завершено'],
  ['hiatus', 'Перерыв'],
  ['cancelled', 'Отменено'],
  ['unknown', 'Неизвестно'],
  ['abandoned', 'Заброшено'],
  ['announced', 'Анонсировано'],
];
const PEGI: [string, string][] = ['3+', '6+', '12+', '16+', '18+'].map((p): [string, string] => [p, p]);
const YEAR_MIN = 1990;
const YEAR_MAX = 2100;

// ---- SvelteKit `__data.json` ----------------------------------------------------------------------------
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * Expands SvelteKit's `devalue` array into a plain JSON tree: every object/array value is an integer index into
 * the flat pool, negative indices are placeholders (`-1` = undefined).
 */
function decodeSvelte(pool: Json[]): Json {
  if (pool.length === 0) throw new Error('Empty data array in SvelteKit response');
  const cache = new Map<number, Json>();
  const resolve = (element: Json): Json => {
    if (Array.isArray(element)) return element.map(resolveRef);
    if (element && typeof element === 'object')
      return Object.fromEntries(Object.entries(element).map(([key, value]) => [key, resolveRef(value)]));
    return element;
  };
  const resolveRef = (element: Json): Json => {
    if (typeof element !== 'number') return resolve(element);
    if (element < 0) return null;
    if (element >= pool.length) return element;
    const value = pool[element]!;
    if (value === null || typeof value !== 'object') return value;
    if (!cache.has(element)) cache.set(element, resolve(value));
    return cache.get(element)!;
  };
  return resolve(pool[0]!);
}

async function svelte<T>(url: string): Promise<T> {
  const response = await http.get(url, { headers });
  // Detail pages stream extra `chunk` lines after the payload: only the first line is the page's data.
  const body = JSON.parse(response.body.split('\n')[0]!) as { nodes: { type: string; data?: Json[] }[] };
  const node = body.nodes
    .slice()
    .reverse()
    .find((n) => n.type === 'data')?.data;
  if (!node) throw new Error('Data node not found in SvelteKit response');
  return decodeSvelte(node) as T;
}

// ---- Dto -----------------------------------------------------------------------------------------------
interface MangaDto {
  slug: string;
  title: string;
  type: string;
  coverUrl?: string | null;
}
interface ChapterDto {
  position: string | number;
  createdAt?: string | null;
}
interface MangaDetailsDto extends MangaDto {
  titleEnglish?: string | null;
  year?: number | null;
  description?: string | null;
  alternateTitles?: string[];
  genres?: string[];
  authors?: string[] | null;
  artists?: string[] | null;
  statusTitle?: string | null;
  pegiRating?: string | null;
  likes?: number | null;
  views?: number | null;
  chapters?: ChapterDto[];
}

/** Paths come with a leading slash, but strip it before joining anyway. */
const toAbsolute = (path?: string | null) => (path?.trim() ? `${BASE_URL}/${path.replace(/^\//, '')}` : undefined);
const credits = (list?: string[] | null) => list?.filter((c) => c !== NOT_AVAILABLE).join(', ') || undefined;

function formatCount(count: number): string {
  if (count >= 1_000_000) {
    const d = Math.floor((count % 1_000_000) / 100_000);
    return `${Math.floor(count / 1_000_000)}${d ? `.${d}` : ''}M`;
  }
  if (count >= 1000) {
    const d = Math.floor((count % 1000) / 100);
    return `${Math.floor(count / 1000)}${d ? `.${d}` : ''}K`;
  }
  return String(count);
}

const summary = (m: MangaDto): MangaSummary => ({
  url: `/${m.type}/${m.slug}`,
  title: m.title,
  thumbnailUrl: toAbsolute(m.coverUrl),
});

function statusOf(title?: string | null): MangaStatus {
  switch (title?.toLowerCase()) {
    case 'ongoing':
      return 'ongoing';
    case 'completed':
      return 'completed';
    case 'paused':
    case 'on hiatus':
    case 'hiatus':
      return 'hiatus';
    case 'discontinued':
    case 'cancelled':
    case 'abandoned':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

function describe(m: MangaDetailsDto): string {
  const parts: string[] = [];
  if (m.description?.trim()) parts.push(m.description.trim());
  const stats = [
    m.views != null ? `Просмотров: ${formatCount(m.views)}` : '',
    m.likes != null ? `Лайков: ${formatCount(m.likes)}` : '',
    m.year != null ? `Год выпуска: ${m.year}` : '',
    m.pegiRating?.trim() ? `Возрастное ограничение: ${m.pegiRating}` : '',
  ].filter(Boolean);
  if (stats.length) parts.push(stats.join('\n'));
  // The site stores the slug among the alternate titles; drop it with anything shown as the title.
  const excluded = new Set([m.slug, m.title.trim()]);
  const alt = [
    ...new Set(
      [...(m.alternateTitles ?? []), ...(m.titleEnglish ? [m.titleEnglish] : [])]
        .map((t) => t.trim())
        .filter((t) => t && !excluded.has(t)),
    ),
  ];
  if (alt.length) parts.push(`Альтернативные названия:${alt.map((t) => `\n• ${t}`).join('')}`);
  return parts.join('\n\n').trim();
}

function catalogUrl(page: number, params: [string, string][]): string {
  const all: [string, string][] = [
    ['offset', String((page - 1) * PAGE_SIZE)],
    ['limit', String(PAGE_SIZE)],
    ['x-sveltekit-invalidated', '001'],
    ...params,
  ];
  return `${BASE_URL}/catalog/__data.json?${all.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

async function catalog(url: string): Promise<MangaPage> {
  const { initialMangas } = await svelte<{ initialMangas: MangaDto[] }>(url);
  return { items: initialMangas.map(summary), hasNextPage: initialMangas.length >= PAGE_SIZE };
}

const checks = (id: string, label: string, list: [string, string][]): Filter => ({
  type: 'group',
  id,
  label,
  filters: list.map(([value, text]): Filter => ({ type: 'checkbox', id: `${id}.${value}`, label: text })),
});

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) =>
      catalog(
        catalogUrl(page, [
          ['sortKey', 'likes'],
          ['sortDescending', 'true'],
        ]),
      ),
    getLatest: (page) =>
      catalog(
        catalogUrl(page, [
          ['sortKey', 'updatedAt'],
          ['sortDescending', 'true'],
        ]),
      ),
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params: [string, string][] = [];
      if (query.trim()) params.push(['query', query.trim()]);
      const sort = filters.order;
      if (typeof sort === 'object') params.push(['sortKey', sort.value], ['sortDescending', String(!sort.ascending)]);
      else params.push(['sortKey', 'updatedAt'], ['sortDescending', 'true']);
      for (const [prefix, param] of [
        ['type', 'types'],
        ['status', 'statuses'],
        ['translation', 'translationStatuses'],
        ['pegi', 'pegiRatings'],
      ] as const) {
        for (const [id, value] of Object.entries(filters))
          if (id.startsWith(`${prefix}.`) && value === true) params.push([param, id.slice(prefix.length + 1)]);
      }
      for (const [id, param] of [
        ['yearFrom', 'releaseYearFrom'],
        ['yearTo', 'releaseYearTo'],
      ] as const) {
        const value = filters[id];
        const trimmed = typeof value === 'string' ? value.trim() : '';
        const year = Number.parseInt(trimmed, 10);
        if (trimmed.length === 4 && !Number.isNaN(year))
          params.push([param, String(Math.min(Math.max(year, YEAR_MIN), YEAR_MAX))]);
      }
      return catalog(catalogUrl(page, params));
    },
    getFilters: (): Filter[] => [
      {
        type: 'sort',
        id: 'order',
        label: 'Сортировать по',
        options: SORTS.map(([value, label]) => ({ value, label })),
        default: { value: 'updatedAt', ascending: false },
      },
      checks('type', 'Тип тайтла', TYPES),
      checks('status', 'Статус тайтла', STATUSES),
      checks('translation', 'Статус перевода', STATUSES),
      checks('pegi', 'Возрастное ограничение', PEGI),
      { type: 'text', id: 'yearFrom', label: `Год: от (минимум ${YEAR_MIN})` },
      { type: 'text', id: 'yearTo', label: `Год: до (максимум ${YEAR_MAX})` },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { manga: m } = await svelte<{ manga: MangaDetailsDto }>(`${BASE_URL}${manga.url}/${SVELTE_DATA_SUFFIX}`);
      return {
        ...summary(m),
        author: credits(m.authors),
        artist: credits(m.artists),
        genres: m.genres,
        status: statusOf(m.statusTitle),
        description: describe(m) || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { manga: m } = await svelte<{ manga: MangaDetailsDto }>(`${BASE_URL}${manga.url}/${SVELTE_DATA_SUFFIX}`);
      return (m.chapters ?? []).map((c): Chapter => {
        const position = String(c.position);
        const time = c.createdAt ? Date.parse(c.createdAt.replace(/(\.\d{3})\d+/, '$1')) : Number.NaN;
        return {
          url: `/${m.type}/${m.slug}/${position}`,
          name: `Глава ${position}`,
          number: Number.parseFloat(position) || undefined,
          uploadedAt: Number.isNaN(time) ? undefined : time,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [type, slug, position] = chapter.url.split('/').filter(Boolean);
      if (!type || !slug || position === undefined) throw new Error(`Invalid chapter URL format: ${chapter.url}`);
      const data = await svelte<{ chapter: { files: { diskFile: string; position: string | number }[] } }>(
        `${BASE_URL}/${type}/${slug}/glava-${position}/${SVELTE_DATA_SUFFIX}`,
      );
      return data.chapter.files
        .map((f) => ({ file: f, order: Number.parseFloat(String(f.position)) || 0 }))
        .sort((a, b) => a.order - b.order)
        .map(({ file }, index) => ({ index, imageUrl: `${BASE_URL}${file.diskFile}` }));
    },
    imageHeaders: () => ({ 'User-Agent': USER_AGENT }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?wamanga\.ru\/([^/?#]+)\/([^/?#]+)/i.exec(url.trim());
      return match && match[1] !== 'catalog' ? { url: `/${match[1]}/${match[2]}`, title: '' } : null;
    },
    getWebUrl(item): string {
      // /type/slug/position → /type/slug/glava-position
      const parts = item.url.split('/').filter(Boolean);
      return absoluteUrl(BASE_URL, parts.length >= 3 ? `/${parts[0]}/${parts[1]}/glava-${parts[2]}` : item.url);
    },
  }),
});
