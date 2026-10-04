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
  type Preference,
  type SortValue,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://honey-manga.com.ua';
const API_URL = 'https://data.api.honey-manga.com.ua';
const SEARCH_API_URL = 'https://search.api.honey-manga.com.ua/v2/manga/pattern';
const IMG_URL = 'https://hmvolumestorage.b-cdn.net/public-resources';
const PAGE_SIZE = 30;
const LOCK = '🔒 ';

const headers = { 'User-Agent': USER_AGENT };

const GENRES = [
  'Апокаліпсис',
  'Ваншот',
  'Вестерн',
  'Героїчне фентезі',
  'Готика',
  'Деменція',
  'Детектив',
  'Джьосей',
  'Доджінші',
  'Драма',
  'Екшн',
  'Еротика',
  'Еччі',
  'Жахи',
  'Ісекай',
  'Історія',
  'Йонкома',
  'Комедія',
  'Магія',
  'Махо-шьоджьо',
  'Махо-шьонен',
  'Меха',
  'Містика',
  'Наукова фантастика',
  'Омегаверс',
  'Пародія',
  'Повсякденність',
  'Постапокаліпсис',
  'Пригоди',
  'Психологія',
  'Романтика',
  'Сейнен',
  'Спокон',
  'Трагедія',
  'Триллер',
  'Фантастика',
  'Фентезі',
  'Філософія',
  'Шьоджьо',
  'Шьоджьо-ай',
  'Шьонен',
  'Шьонен-ай',
  'Юрі',
  'Яой',
];

const TYPES = ['Артбук', 'Вебкомікс', 'Графічний роман', 'Мальопис', 'Манхва', 'Маньхва', 'Манґа', 'Новела'];

const TAGS = [
  'Авторська робота',
  'Аристократія',
  'Артефакти',
  'Божевілля',
  'Бойові мистецтва',
  'Бої на мечах',
  'Брат і сестра',
  'Вампіри',
  'Вигодовування',
  'Виживання',
  'Війна',
  'ГГ жінка',
  'ГГ чоловік',
  'Гарем',
  'Гільдії',
  'Демони',
  'Для дітей',
  'Дружба',
  'Жорстокість',
  'Звіролюди',
  'Зміна статі',
  'Імперії',
  'Казка',
  'Космос',
  'Культивація',
  'Кіберпанк',
  'Магія',
  'Машини',
  'Медицина',
  'Музика',
  'Мурім',
  'Надприродне',
  'Неко',
  'Парапсихологія',
  'Побут',
  'Подорожі у часі',
  'Політика',
  'Помста',
  'Пригоди',
  'Підземелля',
  'Реїнкарнація',
  'Самураї',
  'Система',
  'Спорт',
  'Суперсила',
  'Тварини',
  'Фурі',
  'Чарівники',
  'Чудовиська',
  'Школа',
  'Шматочок життя',
  'Якудза',
];

const GENRES_PREF = 'pref_genres_exclude';
const TYPE_PREF = 'pref_types_exclude';
const CONTENT_PREF = 'pref_content_type';
const HIDE_LOCKED_PREF = 'hide_locked_chapters';
const DEFAULT_TYPE_BLOCK = ['Новела'];

const option = (value: string): FilterOption => ({ value, label: value });

const PREFERENCES: Preference[] = [
  {
    type: 'multiselect',
    key: GENRES_PREF,
    label: 'Приховані жанри',
    description: 'Виберіть жанри які потрібно сховати',
    options: GENRES.map(option),
    default: [],
  },
  {
    type: 'multiselect',
    key: TYPE_PREF,
    label: 'Приховані категорії',
    description: 'Виберіть категорії які потрібно сховати',
    options: TYPES.map(option),
    default: DEFAULT_TYPE_BLOCK,
  },
  {
    type: 'select',
    key: CONTENT_PREF,
    label: 'Виберіть тип контенту для відображення',
    options: [
      { label: 'Весь контент, без обмежень', value: 'all' },
      { label: 'Без контенту 18+', value: 'NOT_IN' },
      { label: 'Лише 18+', value: 'IN' },
    ],
    default: 'all',
  },
  {
    type: 'switch',
    key: HIDE_LOCKED_PREF,
    label: 'Приховувати платні розділи',
    description: 'Може викликати помилки при оновленні. Будуть відмічені іконкою: 🔒',
    default: true,
  },
];

const blockedGenres = () => prefs.get<string[]>(GENRES_PREF) ?? [];
const blockedTypes = () => prefs.get<string[]>(TYPE_PREF) ?? DEFAULT_TYPE_BLOCK;
const contentType = () => prefs.get<string>(CONTENT_PREF) ?? 'all';
const hideLocked = () => prefs.get<boolean>(HIDE_LOCKED_PREF) ?? true;

interface SearchFilter {
  filterBy: string;
  filterOperator: string;
  filterValue: string[];
}

interface ResponseData {
  id: string;
  posterId: string;
  title: string;
  type: string;
  genres?: string[] | null;
  adult: string;
}

interface CursorList<T> {
  data: T[];
  cursorNext?: Record<string, unknown> | null;
}

interface CompleteManga extends ResponseData {
  description?: string | null;
  authors?: string[] | null;
  artists?: string[] | null;
  genresAndTags?: string[] | null;
  titleStatus?: string | null;
}

interface ApiChapter {
  id: string;
  volume: number;
  chapterNum: number;
  subChapterNum: number;
  title: string;
  mangaId: string;
  lastUpdated: string;
  isMonetized: boolean;
}

const INVALID_TITLES = new Set(['', '-', '--', 'title', 'Title']);

const STATUS: Record<string, MangaStatus> = {
  Онґоїнґ: 'ongoing',
  Завершено: 'completed',
  Покинуто: 'cancelled',
  Призупинено: 'hiatus',
};

const hasNext = (list: CursorList<unknown>) => Object.keys(list.cursorNext ?? {}).length > 0;
const idOf = (url: string) => url.substring(url.lastIndexOf('/') + 1);

function toSummary(
  m: ResponseData,
  hiddenTypes: string[] = [],
  hiddenGenres: string[] = [],
  contentShown?: string,
): MangaSummary | null {
  if (hiddenTypes.includes(m.type)) return null;
  if (hiddenGenres.some((genre) => m.genres?.includes(genre))) return null;
  if (contentShown === 'IN' && m.adult !== '18+') return null;
  if (contentShown === 'NOT_IN' && m.adult === '18+') return null;
  // One of the translation teams left the site and renamed all its manga, deleting all images in chapters.
  if (m.title.includes('Наша команда покидає Honey Manga')) return null;
  return { url: `/book/${m.id}`, title: m.title, thumbnailUrl: `${IMG_URL}/${m.posterId}` };
}

const post = async <T>(url: string, json: unknown): Promise<T> =>
  JSON.parse((await http.post(url, { json }, { headers })).body as string) as T;
const get = async <T>(url: string): Promise<T> => JSON.parse((await http.get(url, { headers })).body) as T;

async function catalog(page: number, sortBy: string, filters?: FilterState): Promise<MangaPage> {
  const searchFilters: SearchFilter[] = [];
  let sort = { sortBy, sortOrder: 'DESC' };
  const selected = (id: string) =>
    typeof filters?.[id] === 'string' && filters[id] ? (filters[id] as string) : undefined;
  const keys = (prefix: string, value: unknown) =>
    Object.entries(filters ?? {})
      .filter(([id, v]) => id.startsWith(prefix) && v === value)
      .map(([id]) => id.slice(prefix.length));

  if (filters) {
    if (selected('translation'))
      searchFilters.push({
        filterBy: 'translationStatus',
        filterOperator: 'EQUAL',
        filterValue: [selected('translation')!],
      });
    if (selected('status'))
      searchFilters.push({ filterBy: 'titleStatus', filterOperator: 'EQUAL', filterValue: [selected('status')!] });
    const tagsIn = keys('tag.', 'include');
    const tagsOut = keys('tag.', 'exclude');
    if (tagsIn.length) searchFilters.push({ filterBy: 'tags', filterOperator: 'ALL', filterValue: tagsIn });
    if (tagsOut.length) searchFilters.push({ filterBy: 'tags', filterOperator: 'NOT_IN', filterValue: tagsOut });
    const order = filters.order as SortValue | undefined;
    if (order) sort = { sortBy: order.value, sortOrder: order.ascending ? 'ASC' : 'DESC' };
    // Genres and types hidden in the preferences count as excluded, like the pre-filled filters in Tachiyomi.
    const genresIn = keys('genre.', 'include');
    const genresOut = [...new Set([...keys('genre.', 'exclude'), ...blockedGenres()])].filter(
      (g) => !genresIn.includes(g),
    );
    if (genresIn.length) searchFilters.push({ filterBy: 'genres', filterOperator: 'ALL', filterValue: genresIn });
    if (genresOut.length) searchFilters.push({ filterBy: 'genres', filterOperator: 'NOT_IN', filterValue: genresOut });
    const hidden = TYPES.filter((t) => {
      const value = filters[`hidetype.${t}`];
      return value === undefined ? blockedTypes().includes(t) : value === true;
    });
    if (hidden.length) searchFilters.push({ filterBy: 'type', filterOperator: 'NOT_IN', filterValue: hidden });
    if (selected('type'))
      searchFilters.push({ filterBy: 'type', filterOperator: 'EQUAL', filterValue: [selected('type')!] });
    if (selected('content') && selected('content') !== 'all') {
      searchFilters.push({ filterBy: 'adult', filterOperator: selected('content')!, filterValue: ['18+'] });
    }
  } else {
    // Hidden genres, types and content from the preferences apply to the Popular and Latest tabs.
    if (blockedTypes().length)
      searchFilters.push({ filterBy: 'type', filterOperator: 'NOT_IN', filterValue: blockedTypes() });
    if (blockedGenres().length)
      searchFilters.push({ filterBy: 'genres', filterOperator: 'NOT_IN', filterValue: blockedGenres() });
    if (contentType() !== 'all')
      searchFilters.push({ filterBy: 'adult', filterOperator: contentType(), filterValue: ['18+'] });
  }

  const result = await post<CursorList<ResponseData>>(`${API_URL}/v2/manga/cursor-list`, {
    page,
    pageSize: PAGE_SIZE,
    sort,
    ...(searchFilters.length ? { filters: searchFilters } : {}),
  });
  return {
    items: result.data.flatMap((m) => toSummary(m) ?? []),
    hasNextPage: hasNext(result),
  };
}

function toChapter(c: ApiChapter): Chapter | null {
  if (hideLocked() && c.isMonetized) return null;
  const suffix = c.subChapterNum === 0 ? '' : `.${c.subChapterNum}`;
  const title = INVALID_TITLES.has(c.title) || c.title.toLowerCase().includes('розділ') ? '' : ` ${c.title}`;
  return {
    url: `/read/${c.id}/${c.mangaId}`,
    name: `${c.isMonetized ? LOCK : ''}Том ${c.volume} - Розділ ${c.chapterNum}${suffix}${title}`,
    number: c.subChapterNum === 0 ? c.chapterNum : c.chapterNum + c.subChapterNum / 10,
    uploadedAt: Date.parse(c.lastUpdated) || undefined,
  };
}

const selectFilter = (id: string, label: string, entries: [string, string][], def = ''): Filter => ({
  type: 'select',
  id,
  label,
  options: entries.map(([label, value]) => ({ label, value })),
  default: def,
});

const tristates = (id: string, label: string, names: string[]): Filter => ({
  type: 'group',
  id,
  label,
  filters: names.map((name) => ({ type: 'tristate', id: `${id}.${name}`, label: name })),
});

export default defineExtension({
  preferences: () => PREFERENCES,
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => catalog(page, 'likes'),
    getLatest: (page) => catalog(page, 'lastUpdated'),
    async search(query, page, filters): Promise<MangaPage> {
      if (query) {
        if (query.length < 3) {
          throw new Error('Запит має містити щонайменше 3 символи / The query must contain at least 3 characters');
        }
        const clean = query.replace(/[^\p{L}\d\s]/gu, '');
        const result = await get<ResponseData[]>(`${SEARCH_API_URL}?query=${encodeURIComponent(clean)}`);
        const hiddenTypes = blockedTypes();
        const hiddenGenres = blockedGenres();
        const shown = contentType();
        // Search by name has no pages.
        return {
          items: result.flatMap((m) => toSummary(m, hiddenTypes, hiddenGenres, shown) ?? []),
          hasNextPage: false,
        };
      }
      return catalog(page, 'likes', filters);
    },
    getFilters: (): Filter[] => [
      {
        type: 'sort',
        id: 'order',
        label: 'Сортувати за',
        options: [
          { label: 'За оновленнями', value: 'lastUpdated' },
          { label: 'За кількістю вподобайок', value: 'likes' },
          { label: 'За кількістю переглядів', value: 'views' },
        ],
        default: { value: 'likes', ascending: false },
      },
      selectFilter('type', 'Тип (відобразити)', [['Всі типи', ''], ...TYPES.map((t): [string, string] => [t, t])]),
      {
        type: 'group',
        id: 'hidetype',
        label: 'Тип (приховати)',
        filters: TYPES.map((t) => ({
          type: 'checkbox',
          id: `hidetype.${t}`,
          label: t,
          default: blockedTypes().includes(t),
        })),
      },
      { type: 'separator' },
      tristates('genre', 'Жанри', GENRES),
      { type: 'separator' },
      tristates('tag', 'Категорії', TAGS),
      selectFilter('status', 'Статус', [
        ['Будь-який статус', ''],
        ...['Анонс', 'Завершено', 'Онґоїнґ', 'Покинуто', 'Призупинено'].map((s): [string, string] => [s, s]),
      ]),
      selectFilter('translation', 'Переклад', [
        ['Будь-який статус', ''],
        ...['Анонс', 'Завершено', 'Перекладається', 'Покинуто', 'Призупинено'].map((s): [string, string] => [s, s]),
      ]),
      selectFilter(
        'content',
        'Тип контенту',
        [
          ['Весь контент, без обмежень', 'all'],
          ['Без контенту 18+', 'NOT_IN'],
          ['Лише 18+', 'IN'],
        ],
        'all',
      ),
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const m = await get<CompleteManga>(`${API_URL}/manga/${idOf(manga.url)}`);
      return {
        url: `/book/${m.id}`,
        title: m.title,
        thumbnailUrl: `${IMG_URL}/${m.posterId}`,
        description: m.description || undefined,
        genres: [...(m.adult === '18+' ? ['18+'] : []), m.type, ...(m.genresAndTags ?? [])],
        author: m.authors?.join(', ') || undefined,
        artist: m.artists?.join(', ') || undefined,
        status: STATUS[m.titleStatus ?? ''] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const mangaId = idOf(manga.url);
      const chapters: Chapter[] = [];
      for (let page = 1; ; page++) {
        const data = await post<CursorList<ApiChapter>>(`${API_URL}/v2/chapter/cursor-list`, {
          mangaId,
          page,
          pageSize: 1000,
          sortOrder: 'DESC',
        });
        chapters.push(...data.data.flatMap((c) => toChapter(c) ?? []));
        if (!hasNext(data)) break;
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      if (!hideLocked() && chapter.name.startsWith(LOCK)) throw new Error('Розділ лише для меценатів.');
      const chapterId = /^\/read\/([^/]+)/.exec(chapter.url)?.[1] ?? idOf(chapter.url);
      const { resourceIds } = await get<{ resourceIds: Record<string, string> }>(
        `${API_URL}/chapter/frames/${chapterId}`,
      );
      return Object.entries(resourceIds)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, imageId], index) => ({ index, imageUrl: `${IMG_URL}/${imageId}` }));
    },
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
    resolveUrl(url): MangaSummary | null {
      const match = /^https?:\/\/honey-manga\.com\.ua\/book\/([^/?#]+)/i.exec(url);
      return match ? { url: `/book/${match[1]}`, title: '' } : null;
    },
  }),
});
