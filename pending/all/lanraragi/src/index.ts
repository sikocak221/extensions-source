import {
  type Chapter,
  type Filter,
  type FilterOption,
  type MangaPage,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, withQuery } from './common/utils';

const HOSTNAME_DEFAULT = 'http://127.0.0.1:3000';
const REGEX_ID_FROM_URL = /(?:\/reader\?id=)?(TANK_[0-9]{10}|\w{40})(?:\/thumbnail)?/;

const PREF_HOSTNAME = 'hostname';
const PREF_API_KEY = 'apiKey';
const PREF_NEW_ONLY = 'latestNewOnly';
const PREF_SORT_NS = 'latestNamespacePref';
const PREF_SORT_ORDER = 'latestSortOrder';
const PREF_CLEAR_NEW = 'clearNew';

const SORT_ORDERS: FilterOption[] = [
  { value: 'asc', label: 'Ascending' },
  { value: 'desc', label: 'Descending' },
  { value: 'random', label: 'Random' },
];

const preferences: Preference[] = [
  {
    type: 'text',
    key: PREF_HOSTNAME,
    label: 'Hostname',
    description: 'Address of your LANraragi server',
    default: HOSTNAME_DEFAULT,
  },
  {
    type: 'text',
    key: PREF_API_KEY,
    label: 'API Key',
    description: 'Needed when the server is not in No-Fun Mode',
    default: '',
  },
  {
    type: 'switch',
    key: PREF_CLEAR_NEW,
    label: 'Clear New status',
    description: "Clear an entry's New status when its details are viewed.",
    default: true,
  },
  { type: 'switch', key: PREF_NEW_ONLY, label: 'Latest - New Only', default: true },
  {
    type: 'text',
    key: PREF_SORT_NS,
    label: 'Latest - Sort by Namespace',
    description: 'Such as date_added or lastread.',
    default: 'date_added',
  },
  { type: 'select', key: PREF_SORT_ORDER, label: 'Latest - Default Sort Order', options: SORT_ORDERS, default: 'desc' },
];

interface Archive {
  arcid: string;
  title: string;
  tags?: string | null;
  summary?: string | null;
  isnew: boolean;
  pagecount: number;
  toc?: { name: string; page: number }[] | null;
}
interface SearchResult {
  data: Archive[];
  recordsFiltered?: number | null;
  recordsTotal: number;
}
interface Tankoubon {
  result?: { id: string; name?: string | null; summary?: string | null; full_data?: Archive[] | null } | null;
}
interface Category {
  id: string;
  name?: string | null;
  pinned?: number | null;
}

const pref = (key: string, fallback = ''): string => prefs.get<string>(key) ?? fallback;
const baseUrl = (): string => pref(PREF_HOSTNAME, HOSTNAME_DEFAULT).replace(/\/+$/, '');

function headers(): Record<string, string> {
  const result: Record<string, string> = { 'User-Agent': USER_AGENT };
  const apiKey = pref(PREF_API_KEY);
  if (apiKey) result.Authorization = `Bearer ${base64.encode(apiKey)}`;
  return result;
}

async function getJson<T>(url: string): Promise<T> {
  try {
    const response = await http.get<T>(url, { headers: headers(), responseType: 'json' });
    return response.body;
  } catch (error) {
    if (String(error).includes('401')) {
      throw new Error("If the server is in No-Fun Mode make sure the extension's API Key is correct.");
    }
    throw error;
  }
}

const idFromUrl = (url: string): string => REGEX_ID_FROM_URL.exec(url)?.[1] ?? '';
const thumbnailUri = (id: string): string =>
  `${baseUrl()}/api/${id.startsWith('TANK_') ? 'tankoubons' : 'archives'}/${id}/thumbnail`;

function nsTag(tags: string | null | undefined, namespace: string): string[] | undefined {
  const values = (tags ?? '')
    .split(',')
    .filter((tag) => tag.startsWith(`${namespace}:`))
    .map((tag) => tag.split(':').slice(1).join(':'));
  const unique = [...new Set(values)];
  return unique.length ? unique : undefined;
}

function toSummary(archive: Archive): MangaSummary {
  return { url: `/reader?id=${archive.arcid}`, title: archive.title, thumbnailUrl: thumbnailUri(archive.arcid) };
}

let lastResultCount = 0;

export default defineExtension({
  preferences: () => preferences,
  createSource: () => {
    async function searchArchives(page: number, query: string, params: Record<string, string>): Promise<MangaPage> {
      const isRandom = params.order === 'random';
      if (page === 1) lastResultCount = 0;
      const { order, startingPage, ...rest } = params;
      const startOffset = Math.max((Number.parseInt(startingPage ?? '', 10) || 1) - 1, 0);
      const currentStart = (page - 1 + startOffset) * lastResultCount;
      const query2: Record<string, string | undefined> = {
        ...rest,
        start: String(currentStart),
        filter: query || undefined,
      };
      let path = '/api/search';
      if (isRandom) {
        path += '/random';
        query2.count = '100';
        delete query2.sortby;
      } else if (order) query2.order = order;
      const result = await getJson<SearchResult>(withQuery(baseUrl() + path, query2));
      lastResultCount = result.data.length;
      const hasNext = isRandom || currentStart + lastResultCount < (result.recordsFiltered ?? -2);
      return { items: result.data.map(toSummary), hasNextPage: hasNext };
    }

    return {
      baseUrl: baseUrl(),
      getPopular: (page) => searchArchives(page, '', { groupby_tanks: 'true' }),
      getLatest: (page) => {
        const params: Record<string, string> = { groupby_tanks: 'true', order: pref(PREF_SORT_ORDER, 'desc') };
        if (prefs.get<boolean>(PREF_NEW_ONLY) ?? true) params.newonly = 'true';
        const namespace = pref(PREF_SORT_NS, 'date_added').trim();
        if (namespace) params.sortby = namespace;
        return searchArchives(page, '', params);
      },
      search: (query, page, filters) => {
        const params: Record<string, string> = {};
        const str = (id: string): string => (typeof filters[id] === 'string' ? (filters[id] as string) : '');
        if (str('category')) params.category = str('category');
        if (str('order')) params.order = str('order');
        if (filters.newonly === true) params.newonly = 'true';
        if (filters.untaggedonly === true) params.untaggedonly = 'true';
        if (filters.hidecompleted === true) params.hidecompleted = 'true';
        params.groupby_tanks = filters.tanks === false ? 'false' : 'true';
        if (str('sortby').trim()) params.sortby = str('sortby').trim();
        if (str('startingPage')) params.startingPage = str('startingPage');
        return searchArchives(page, query, params);
      },
      getFilters: async (): Promise<Filter[]> => {
        let categories: FilterOption[] = [{ value: '', label: '' }];
        try {
          const list = await getJson<Category[]>(`${baseUrl()}/api/categories`);
          categories = [
            ...categories,
            ...[...list]
              .sort((a, b) => (b.pinned ?? 0) - (a.pinned ?? 0) || (a.name ?? '').localeCompare(b.name ?? ''))
              .map((c) => ({ value: c.id, label: `${c.pinned === 1 ? '📌 ' : ''}${c.name ?? c.id}` })),
          ];
        } catch {
          // server unreachable: no categories
        }
        return [
          { type: 'select', id: 'category', label: 'Category', options: categories },
          { type: 'select', id: 'order', label: 'Sort order', options: SORT_ORDERS, default: 'asc' },
          { type: 'checkbox', id: 'newonly', label: 'New Archives only' },
          { type: 'checkbox', id: 'untaggedonly', label: 'Untagged Archives only' },
          { type: 'checkbox', id: 'hidecompleted', label: 'Hide Completed' },
          { type: 'checkbox', id: 'tanks', label: 'Group by Tankoubon', default: true },
          { type: 'text', id: 'startingPage', label: 'Starting page' },
          { type: 'text', id: 'sortby', label: 'Sort by (namespace)' },
        ];
      },
      getMangaDetails: async (manga) => {
        const id = idFromUrl(manga.url);
        const { archive } = await loadArchives(id);
        const tags = archive.tags ?? undefined;
        const artist = nsTag(tags, 'artist')?.join(', ');
        return {
          url: manga.url,
          title: archive.title,
          thumbnailUrl: thumbnailUri(id),
          description: archive.summary?.trim() ? archive.summary : archive.title,
          genres: tags
            ? tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
            : undefined,
          artist,
          author: nsTag(tags, 'group')?.join(', ') ?? artist,
          status: 'completed',
        };
      },
      getChapters: async (manga): Promise<Chapter[]> => {
        const id = idFromUrl(manga.url);
        const { archives } = await loadArchives(id);
        if ((prefs.get<boolean>(PREF_CLEAR_NEW) ?? true) && archives.length === 1 && archives[0]!.isnew) {
          await http
            .request({
              url: `${baseUrl()}/api/archives/${archives[0]!.arcid}/isnew`,
              method: 'DELETE',
              headers: headers(),
            })
            .catch(() => undefined);
        }
        const chapters: Chapter[] = [];
        let baseChapter = 0;
        for (const arc of archives) {
          baseChapter += 1;
          const baseFiles = `${baseUrl()}/api/archives/${arc.arcid}/files`;
          const added = Number(nsTag(arc.tags, 'date_added')?.[0] ?? 0);
          const uploadedAt = added ? added * 1000 : undefined;
          if (arc.toc?.length) {
            const toc = [...(arc.toc[0]!.page > 1 ? [{ name: arc.title, page: 1 }] : []), ...arc.toc];
            let lastStart = 0;
            toc.forEach((entry, i) => {
              const nextPage = i + 1 < toc.length ? toc[i + 1]!.page - 1 : arc.pagecount;
              const number = baseChapter + Number(`0.${i + 1}`);
              chapters.push({
                url: `${baseFiles}#${lastStart}-${nextPage}`,
                number,
                name: `${number} - ${entry.name}`,
                uploadedAt,
              });
              lastStart = nextPage;
            });
          } else {
            chapters.push({
              url: baseFiles,
              number: baseChapter,
              name: archives.length === 1 ? 'Chapter' : `${baseChapter} - ${arc.title}`,
              uploadedAt,
            });
          }
        }
        return chapters.reverse();
      },
      getPages: async (chapter): Promise<Page[]> => {
        const [url, fragment] = chapter.url.split('#');
        const result = await getJson<{ pages: string[] }>(url!);
        const range = fragment ? fragment.split('-').map((n) => Number.parseInt(n, 10)) : [0, result.pages.length];
        const subPath = baseUrl().replace(/^https?:\/\/[^/]+/, '');
        return result.pages.slice(range[0], range[range.length - 1]).map((path, index) => {
          const relative = (subPath && path.startsWith(subPath) ? path.slice(subPath.length) : path).replace(
            /^\.+/,
            '',
          );
          return { index, imageUrl: `${baseUrl()}${relative}` };
        });
      },
      imageHeaders: () => headers(),
      getWebUrl: (item) => (item.url.startsWith('http') ? item.url : `${baseUrl()}${item.url}`),
    };
  },
});

async function loadArchives(id: string): Promise<{ archive: Archive; archives: Archive[] }> {
  if (!id.startsWith('TANK_')) {
    const archive = await getJson<Archive>(`${baseUrl()}/api/archives/${id}/metadata`);
    return { archive, archives: [archive] };
  }
  const tank = await getJson<Tankoubon>(`${baseUrl()}/api/tankoubons/${id}/full`);
  const result = tank.result;
  if (!result) throw new Error('Tankoubon not found');
  const full = result.full_data ?? [];
  const tags = full
    .map((a) => a.tags ?? '')
    .join(',')
    .split(',')
    .sort()
    .join(',');
  const archive: Archive = {
    arcid: result.id,
    isnew: false,
    tags,
    summary: result.summary,
    title: result.name ?? result.id,
    toc: [],
    pagecount: 0,
  };
  return { archive, archives: full };
}
