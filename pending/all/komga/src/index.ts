import {
  type Chapter,
  type Filter,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, parseDate } from './common/utils';

const PREF_ADDRESS = 'Address';
const PREF_USERNAME = 'Username';
const PREF_PASSWORD = 'Password';
const PREF_API_KEY = 'API key';
const PREF_DEFAULT_LIBRARIES = 'Default libraries';
const PREF_CHAPTER_NAME_TEMPLATE = 'Chapter name template';
const CHAPTER_NAME_TEMPLATE_DEFAULT = '{number} - {title} ({size})';
const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/jxl',
  'image/heif',
  'image/avif',
];

const TYPES = ['Series', 'Read lists', 'Books'];
const SORTS = ['Relevance', 'Alphabetically', 'Date added', 'Date updated', 'Random'];

interface Author {
  name: string;
  role: string;
}
interface SeriesDto {
  id: string;
  booksCount: number;
  metadata: {
    status: string;
    title: string;
    summary: string;
    genres: string[];
    tags: string[];
    totalBookCount?: number | null;
  };
  booksMetadata: { authors?: Author[]; tags?: string[]; summary: string };
}
interface BookDto {
  id: string;
  seriesTitle: string;
  name: string;
  created?: string | null;
  fileLastModified: string;
  sizeBytes: number;
  size: string;
  media: { mediaProfile?: string; epubDivinaCompatible?: boolean };
  metadata: {
    title: string;
    summary: string;
    number: string;
    numberSort: number;
    releaseDate?: string | null;
    authors: Author[];
    tags: string[];
  };
}
interface ReadListDto {
  id: string;
  name: string;
  summary: string;
}
interface PageWrapper<T> {
  content: T[];
  last: boolean;
}

const preferences: Preference[] = [
  { type: 'text', key: PREF_ADDRESS, label: 'Address', description: 'e.g. http://192.168.1.10:25600', default: '' },
  { type: 'text', key: PREF_API_KEY, label: 'API key', description: 'Overrides username and password', default: '' },
  { type: 'text', key: PREF_USERNAME, label: 'Username', default: '' },
  { type: 'text', key: PREF_PASSWORD, label: 'Password', default: '' },
  {
    type: 'text',
    key: PREF_CHAPTER_NAME_TEMPLATE,
    label: 'Chapter name template',
    description: 'Available: {title} {seriesTitle} {number} {createdDate} {releaseDate} {size} {sizeBytes}',
    default: CHAPTER_NAME_TEMPLATE_DEFAULT,
  },
  {
    type: 'text',
    key: PREF_DEFAULT_LIBRARIES,
    label: 'Default libraries',
    description: 'Comma-separated library ids',
    default: '',
  },
];

const pref = (key: string, fallback = ''): string => (prefs.get<string>(key) ?? fallback).trim();
const baseUrl = (): string => pref(PREF_ADDRESS).replace(/\/+$/, '');

function headers(): Record<string, string> {
  const result: Record<string, string> = { 'User-Agent': 'TachiyomiKomga/Matane' };
  const apiKey = pref(PREF_API_KEY);
  const username = pref(PREF_USERNAME);
  if (apiKey) result['X-API-Key'] = apiKey;
  else if (username) result.Authorization = `Basic ${base64.encode(`${username}:${pref(PREF_PASSWORD)}`)}`;
  return result;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await http.get<T>(url, { headers: headers(), responseType: 'json' });
  return response.body;
}

const statusOf = (series: SeriesDto): MangaStatus => {
  const { status, totalBookCount } = series.metadata;
  if (status === 'ENDED' && totalBookCount != null && series.booksCount < totalBookCount) return 'ongoing';
  if (status === 'ENDED') return 'completed';
  if (status === 'ONGOING') return 'ongoing';
  if (status === 'ABANDONED') return 'cancelled';
  if (status === 'HIATUS') return 'hiatus';
  return 'unknown';
};

const apiUrl = (path: string): string => `${baseUrl()}/api/v1/${path}`;
const seriesUrl = (id: string): string => `/api/v1/series/${id}`;
const kindOf = (url: string): 'readlist' | 'book' | 'series' =>
  url.includes('/api/v1/readlists') ? 'readlist' : url.includes('/api/v1/books') ? 'book' : 'series';

function authorsOf(authors: Author[], role: string): string | undefined {
  const names = [...new Set(authors.filter((a) => a.role === role).map((a) => a.name))];
  return names.length ? names.join(', ') : undefined;
}

function chapterName(book: BookDto, template: string, isFromReadList: boolean): string {
  const values: Record<string, string> = {
    title: book.metadata.title,
    seriesTitle: book.seriesTitle,
    number: book.metadata.number,
    createdDate: book.created ?? '',
    releaseDate: book.metadata.releaseDate ?? '',
    size: book.size,
    sizeBytes: String(book.sizeBytes),
  };
  const name = template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
  return isFromReadList ? `${book.seriesTitle} ${name}` : name;
}

function bookDate(book: BookDto): number | undefined {
  return book.metadata.releaseDate
    ? parseDate(book.metadata.releaseDate, 'yyyy-MM-dd')
    : parseDate((book.created ?? book.fileLastModified)?.slice(0, 19), "yyyy-MM-dd'T'HH:mm:ss");
}

function bookToChapter(book: BookDto, number: number, isFromReadList: boolean): Chapter {
  const translators = book.metadata.authors
    .filter((a) => a.role === 'translator')
    .map((a) => a.name)
    .join(', ');
  return {
    url: `/api/v1/books/${book.id}`,
    name: chapterName(book, pref(PREF_CHAPTER_NAME_TEMPLATE, CHAPTER_NAME_TEMPLATE_DEFAULT), isFromReadList),
    number,
    scanlator: translators || undefined,
    uploadedAt: bookDate(book),
  };
}

export default defineExtension({
  preferences: () => preferences,
  createSource: () => {
    function summaries(type: string, content: (SeriesDto | BookDto | ReadListDto)[]): MangaSummary[] {
      return content.map((item) => {
        if (type === 'readlists') {
          const list = item as ReadListDto;
          return {
            url: `/api/v1/readlists/${list.id}`,
            title: list.name,
            thumbnailUrl: `${baseUrl()}/api/v1/readlists/${list.id}/thumbnail`,
          };
        }
        if (type === 'books') {
          const book = item as BookDto;
          return {
            url: `/api/v1/books/${book.id}`,
            title: book.metadata.title,
            thumbnailUrl: `${baseUrl()}/api/v1/books/${book.id}/thumbnail`,
          };
        }
        const series = item as SeriesDto;
        return {
          url: seriesUrl(series.id),
          title: series.metadata.title,
          thumbnailUrl: `${baseUrl()}${seriesUrl(series.id)}/thumbnail`,
        };
      });
    }

    async function list(
      page: number,
      query: string,
      sort: [number, boolean],
      extra: [string, string][] = [],
      type = 'series',
      collection?: string,
    ): Promise<MangaPage> {
      const path = collection ? `collections/${collection}/series` : type;
      const params: [string, string][] = [
        ['search', query],
        ['page', String(page - 1)],
        ['deleted', 'false'],
        ...extra,
      ];
      const libs = pref(PREF_DEFAULT_LIBRARIES);
      if (libs && !extra.some(([k]) => k === 'library_id')) params.push(['library_id', libs]);
      const criteria = [
        'relevance',
        type === 'series' ? 'metadata.titleSort' : 'name',
        'createdDate',
        'lastModifiedDate',
        'random',
      ][sort[0]];
      params.push(['sort', `${criteria},${sort[1] ? 'asc' : 'desc'}`]);
      const url = `${apiUrl(path)}?${params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}`;
      const data = await getJson<PageWrapper<SeriesDto | BookDto | ReadListDto>>(url);
      return { items: summaries(collection ? 'series' : type, data.content), hasNextPage: !data.last };
    }

    return {
      get baseUrl() {
        return baseUrl();
      },
      getPopular: (page) => list(page, '', [1, true]),
      getLatest: (page) => list(page, '', [3, false]),
      search: (query, page, filters) => {
        const extra: [string, string][] = [];
        const status = (id: string): boolean => filters[id] === true;
        if (status('unread')) extra.push(['read_status', 'UNREAD'], ['read_status', 'IN_PROGRESS']);
        if (status('inprogress')) extra.push(['read_status', 'IN_PROGRESS']);
        if (status('read')) extra.push(['read_status', 'READ']);
        const typeIndex = TYPES.indexOf(typeof filters.type === 'string' ? filters.type : 'Series');
        const type = typeIndex === 1 ? 'readlists' : typeIndex === 2 ? 'books' : 'series';
        const sort = filters.sort;
        const sortState: [number, boolean] =
          sort && typeof sort === 'object' ? [Math.max(SORTS.indexOf(sort.value), 0), sort.ascending] : [0, true];
        const collection =
          typeof filters.collection === 'string' && filters.collection ? filters.collection : undefined;
        return list(page, query, sortState, extra, type, collection);
      },
      getFilters: async (): Promise<Filter[]> => {
        let collections: { label: string; value: string }[] = [{ label: 'None', value: '' }];
        try {
          const data = await getJson<{ content: { id: string; name: string }[] }>(apiUrl('collections?unpaged=true'));
          collections = [...collections, ...data.content.map((c) => ({ label: c.name, value: c.id }))];
        } catch {
          // not logged in
        }
        return [
          { type: 'checkbox', id: 'unread', label: 'Unread' },
          { type: 'checkbox', id: 'inprogress', label: 'In Progress' },
          { type: 'checkbox', id: 'read', label: 'Read' },
          {
            type: 'select',
            id: 'type',
            label: 'Search for',
            options: TYPES.map((t) => ({ label: t, value: t })),
            default: 'Series',
          },
          { type: 'select', id: 'collection', label: 'Collection', options: collections },
          {
            type: 'sort',
            id: 'sort',
            label: 'Sort',
            options: SORTS.map((s) => ({ label: s, value: s })),
            default: { value: 'Relevance', ascending: true },
          },
        ];
      },
      getMangaDetails: async (manga) => {
        const kind = kindOf(manga.url);
        const url = baseUrl() + manga.url;
        if (kind === 'readlist') {
          const data = await getJson<ReadListDto>(url);
          return {
            url: manga.url,
            title: data.name,
            description: data.summary,
            thumbnailUrl: `${url}/thumbnail`,
            status: 'unknown',
          };
        }
        if (kind === 'book') {
          const book = await getJson<BookDto>(url);
          const authors = book.metadata.authors.map((a) => a.name).join(', ');
          return {
            url: manga.url,
            title: book.metadata.title,
            description: book.metadata.summary,
            thumbnailUrl: `${url}/thumbnail`,
            genres: [...new Set(book.metadata.tags)],
            author: authors || undefined,
            artist: authors || undefined,
            status: 'unknown',
          };
        }
        const series = await getJson<SeriesDto>(url);
        const authors = series.booksMetadata.authors ?? [];
        return {
          url: manga.url,
          title: series.metadata.title,
          description: series.metadata.summary.trim() ? series.metadata.summary : series.booksMetadata.summary,
          thumbnailUrl: `${url}/thumbnail`,
          genres: [
            ...new Set([...series.metadata.genres, ...series.metadata.tags, ...(series.booksMetadata.tags ?? [])]),
          ].sort(),
          author: authorsOf(authors, 'writer'),
          artist: authorsOf(authors, 'penciller'),
          status: statusOf(series),
        };
      },
      getChapters: async (manga): Promise<Chapter[]> => {
        const kind = kindOf(manga.url);
        if (kind === 'book') {
          const book = await getJson<BookDto>(`${baseUrl()}${manga.url}`);
          return [bookToChapter(book, 1, true)];
        }
        const data = await getJson<PageWrapper<BookDto>>(
          `${baseUrl()}${manga.url}/books?unpaged=true&media_status=READY&deleted=false`,
        );
        const fromReadList = kind === 'readlist';
        return data.content
          .filter((book) => book.media.mediaProfile !== 'EPUB' || book.media.epubDivinaCompatible)
          .map((book, index) => bookToChapter(book, fromReadList ? index + 1 : book.metadata.numberSort, fromReadList))
          .sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
      },
      getPages: async (chapter): Promise<Page[]> => {
        const pages = await getJson<{ number: number; mediaType: string }[]>(`${baseUrl()}${chapter.url}/pages`);
        return pages.map((page) => ({
          index: page.number,
          imageUrl: `${baseUrl()}${chapter.url}/pages/${page.number}${SUPPORTED_IMAGE_TYPES.includes(page.mediaType) ? '' : '?convert=png'}`,
        }));
      },
      imageHeaders: () => ({ ...headers(), Accept: 'image/*,*/*;q=0.8' }),
      getWebUrl: (item) => `${baseUrl()}${item.url.replace('/api/v1/books', '/book').replace('/api/v1', '')}`,
    };
  },
});
