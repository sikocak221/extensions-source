import {
  type Chapter,
  type Filter,
  type FilterOption,
  type FilterState,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type SortValue,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://comixtopia.in.ua';
const API_URL = 'https://supa.comixtopia.in.ua/rest/v1';
const IMG_HOST = 'https://comicbookstorage.fra1.cdn.digitaloceanspaces.com';
const API_KEY =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc2Mzk4NTk2MCwiZXhwIjo0OTE5NjU5NTYwLCJyb2xlIjoiYW5vbiJ9.mYabtnjgn71ekivrvtG86uRTUBgcUOorS9sHlT--Ats';
const PAGINATION = 10;

const apiHeaders = {
  'User-Agent': USER_AGENT,
  apikey: API_KEY,
  authorization: `Bearer ${API_KEY}`,
  'x-client-info': 'supabase-ssr/0.10.3 createBrowserClient',
};

const AGE_LIMITS = ['0', '6', '13', '16', '18'];

interface Title {
  slug: string;
  ukrainian_name: string;
  cover: string;
}

interface Named {
  name: string;
}

interface ComicFull extends Title {
  original_name?: string | null;
  release_year?: string | null;
  comic_status: string;
  age_limit?: number | null;
  description?: string | null;
  authors?: Named[] | null;
  publishers?: Named[] | null;
  genres?: Named[] | null;
  votes?: { rating: number }[] | null;
  issues?:
    | { id: number; issue_no: number; translator: string; created_at: string; metadata?: { state?: string } | null }[]
    | null;
}

const STATUS: Record<string, MangaStatus> = { ongoing: 'ongoing', finished: 'completed' };

const query = (params: [string, string][]) =>
  params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

async function api<T>(path: string, params: [string, string][], extra: Record<string, string> = {}) {
  const response = await http.get(`${API_URL}/${path}?${query(params)}`, { headers: { ...apiHeaders, ...extra } });
  return { body: JSON.parse(response.body) as T, headers: response.headers };
}

/** Image paths hold spaces, brackets and Cyrillic: percent-encode each segment like OkHttp does. */
const encodeImage = (path: string) => `${IMG_HOST}/${path.split('/').map(encodeURIComponent).join('/')}`;

const toSummary = (t: Title): MangaSummary => ({
  url: `/titles/${t.slug}`,
  title: t.ukrainian_name,
  thumbnailUrl: encodeImage(t.cover),
});

const slugOf = (url: string) => url.replace(/\/+$/, '').split('/').pop() ?? '';

async function list(page: number, sortBy: string, text = '', filters?: FilterState): Promise<MangaPage> {
  const params: [string, string][] = [
    [
      'select',
      'slug,ukrainian_name,cover,authors:authors!inner(id),genres:genres!inner(id),publishers:publishers!inner(id),metadata:comics_metadata!inner(state,views)',
    ],
    ['metadata.state', 'eq.approved'],
  ];
  if (text.trim()) params.push(['or', `(ukrainian_name.ilike.*${text}*,original_name.ilike.*${text}*)`]);
  if (filters) {
    const checked = (prefix: string) =>
      Object.entries(filters)
        .filter(([id, v]) => id.startsWith(prefix) && v === true)
        .map(([id]) => id.slice(prefix.length));
    const inList = (column: string, prefix: string) => {
      const values = checked(prefix);
      if (values.length) params.push([column, `in.(${values.join(',')})`]);
    };
    inList('genres.id', 'genre.');
    inList('authors.id', 'author.');
    inList('publishers.id', 'publisher.');
    if (filters.status) params.push(['comic_status', `eq.${filters.status as string}`]);
    inList('age_limit', 'age.');
    const order = (filters.order as SortValue | undefined) ?? { value: 'metadata(views)', ascending: false };
    params.push(['order', `${order.value}.${order.ascending ? 'asc' : 'desc'}`]);
    if (order.value === 'issue_count') params.push(['issue_count', 'gt.0']);
  } else {
    params.push(['order', sortBy]);
  }
  params.push(['limit', String(PAGINATION)], ['offset', String((page - 1) * PAGINATION)]);
  const { body, headers } = await api<Title[]>('comics', params, { Prefer: 'count=exact' });
  const range = Object.entries(headers).find(([name]) => name.toLowerCase() === 'content-range')?.[1];
  const total = Number.parseInt(range?.split('/')[1] ?? '', 10) || 0;
  return { items: body.map(toSummary), hasNextPage: page * 10 < total };
}

async function names(table: string): Promise<FilterOption[]> {
  const { body } = await api<{ id: number; name: string }[]>(table, [['select', 'id,name']]);
  return body
    .map((x) => ({ label: x.name, value: String(x.id) }))
    .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

const group = (id: string, label: string, options: FilterOption[]): Filter => ({
  type: 'group',
  id,
  label,
  filters: options.map((o) => ({ type: 'checkbox', id: `${id}.${o.value}`, label: o.label })),
});

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => list(page, 'metadata(views).desc'),
    getLatest: (page) => list(page, 'updated_at.desc'),
    search: (text, page, filters) => list(page, '', text, filters),
    async getFilters(): Promise<Filter[]> {
      const [genres, authors, publishers] = await Promise.all([
        names('genres').catch(() => []),
        names('authors').catch(() => []),
        names('publishers').catch(() => []),
      ]);
      const filters: Filter[] = [
        {
          type: 'sort',
          id: 'order',
          label: 'Сортувати за',
          options: [
            { label: 'Датою', value: 'updated_at' },
            { label: 'Популярністю', value: 'metadata(views)' },
            { label: 'Кількістю перекладених випусків', value: 'issue_count' },
            { label: 'Рік випуску', value: 'release_year' },
          ],
          default: { value: 'metadata(views)', ascending: false },
        },
      ];
      if (genres.length) filters.push(group('genre', 'Жанри', genres));
      if (authors.length) filters.push(group('author', 'Автори', authors));
      if (publishers.length) filters.push(group('publisher', 'Видавництва', publishers));
      filters.push(
        group(
          'age',
          'Вікове обмеження',
          AGE_LIMITS.map((a) => ({ label: `${a}+`, value: a })),
        ),
        {
          type: 'select',
          id: 'status',
          label: 'Статус виходу',
          options: [
            { label: 'Будь-який статус', value: '' },
            { label: 'Триває', value: 'ongoing' },
            { label: 'Закінчено', value: 'finished' },
          ],
          default: '',
        },
      );
      return filters;
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const slug = slugOf(manga.url);
      const { body } = await api<ComicFull[]>('comics', [
        [
          'select',
          'slug,original_name,ukrainian_name,release_year,comic_status,age_limit,description,cover,authors:authors!inner(name),publishers:publishers!inner(name),genres:genres!inner(name),votes:votes!inner(rating)',
        ],
        ['slug', `eq.${slug}`],
      ]);
      const m = body[0];
      if (!m) throw new Error('Manga not found');
      let description = '';
      if (m.original_name) description += `**Оригінальна назва**: ${m.original_name}\n`;
      const ratings = (m.votes ?? []).map((v) => v.rating);
      if (ratings.length) {
        const average = ratings.reduce((a, b) => a + b, 0) / ratings.length;
        description += `**Рейтинг**: ${average.toFixed(2)}/5 (Голосів: ${ratings.length})\n`;
      }
      if (m.release_year) description += `**Рік випуску**: ${m.release_year}\n`;
      if (m.description) description += m.description;
      return {
        ...toSummary(m),
        description,
        author: m.authors?.map((a) => a.name).join(', ') || undefined,
        artist: m.publishers?.map((p) => p.name).join(', ') || undefined,
        genres: [...(m.age_limit != null ? [`${m.age_limit}+`] : []), ...(m.genres ?? []).map((g) => g.name)],
        status: STATUS[m.comic_status] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const slug = slugOf(manga.url);
      const { body } = await api<ComicFull[]>('comics', [
        ['select', 'slug,issues:issues!inner(id,issue_no,translator,created_at,metadata:issues_metadata!inner(state))'],
        ['slug', `eq.${slug}`],
      ]);
      return (body[0]?.issues ?? [])
        .filter((issue) => issue.metadata?.state === 'approved')
        .map((issue) => ({
          url: `/titles/${slug}/${issue.id}`,
          name: `Розділ #${issue.issue_no}`,
          number: issue.issue_no,
          scanlator: issue.translator?.trim() ? issue.translator : undefined,
          uploadedAt: Date.parse(issue.created_at) || undefined,
        }))
        .sort((a, b) => b.number - a.number || (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const id = chapter.url.split('/').pop() ?? '';
      const { body } = await api<{ image_list?: string[] | null }[]>('issues', [
        ['select', 'image_list'],
        ['id', `eq.${id}`],
      ]);
      const images = body[0]?.image_list ?? [];
      if (images.length === 0) throw new Error('Не вдалося знайти зображення. Перевірте розділ у WebView.');
      return images.map((image, index) => ({ index, imageUrl: encodeImage(image) }));
    },
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
    resolveUrl(url): MangaSummary | null {
      const match = /^https?:\/\/comixtopia\.in\.ua\/titles\/([^/?#]{2,})/i.exec(url);
      return match ? { url: `/titles/${match[1]}`, title: '' } : null;
    },
  }),
});
