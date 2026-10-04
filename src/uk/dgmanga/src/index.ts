import {
  type Chapter,
  type Filter,
  type FilterOption,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://dgmanga.app';
const API_URL = `${BASE_URL}/api`;

const headers = { 'User-Agent': USER_AGENT };

const GENRES = [
  'Антиутопія',
  'Антологія',
  'Апокаліпсис',
  'Бойовик',
  'Бойові мистецтва',
  'Виживання',
  'Гарем',
  'Дарк романтика',
  'Детектив',
  'Джьосей',
  'Для дітей',
  'Доджінші',
  'Драма',
  'Еротика',
  'Еччі',
  'Жахи',
  'Жорстокість',
  'Зворотній гарем',
  'Зміна статі',
  'Ігри',
  'Ісекай',
  'Історичний сеттинг',
  'Іяшікей',
  'Йонкома',
  'Кодомомуке',
  'Комедія',
  'Космос',
  'Махо-шьоджьо',
  'Махо-шьонен',
  'Меха',
  'Містика',
  'Надприродне',
  'Наукова фантастика',
  'Омегаверс',
  'Пародія',
  'Повсякденність',
  'Постапокаліптика',
  'Пригоди',
  'Психологія',
  'Романтика',
  'Сейнен',
  'Сентай',
  'Трагедія',
  'Трилер',
  'Університет',
  'Утопія',
  'Фантастика',
  'Фентезі',
  'Філософія',
  'Школа',
  'Шьоджьо',
  'Шьоджьо-ай',
  'Шьонен',
  'Шьонен-ай',
  'Юрі',
  'Яой',
];

const TAGS = [
  'Адаптація',
  'Академія',
  'Ангст',
  'Аристократія',
  'Артефакти',
  'Бара',
  'БДСМ',
  'Божевілля',
  'Бої',
  'Бої на мечах',
  'Вампіри',
  'Відео-ігри',
  'Війна',
  'Віртуальна реальність',
  "Втрата пам'яті",
  'Вуличні бої',
  'Габаритний актив',
  'Габаритний пасив',
  'ГГ жінка',
  'ГГ чоловік',
  'Гендерна інтрига',
  'Ґідверс',
  'Гільдії',
  'Ґяру',
  'Демони',
  'Діти',
  'Дорослі стосунки',
  'Дружба',
  'Друзі дитинства',
  'Епізод життя',
  'Еспери',
  'Звірі',
  'Звіролюди',
  'Злочини',
  'Знущання',
  'Зомбі',
  'Зрада',
  'Кінки',
  'Кохання',
  'Культивація',
  'Куховарення',
  'Лиходії',
  'Любовний квадрат',
  'Любовний трикутник',
  'Магія',
  'Медицина',
  'Мистецтво',
  'Міфічні істоти',
  'Молодший актив',
  'Молодший пасив',
  'Музика',
  'Насилля',
  'Непорозуміння',
  'Нерозділене кохання',
  'Нінджя',
  'Обмін тілами',
  'Одержимість',
  'Офісні працівники',
  'Парапсихологія',
  'Перше кохання',
  'Підземелля',
  'Підняття вежею',
  'Політика',
  'Поліція',
  'Прибульці',
  'Привиди',
  'Провідники',
  'Регресія',
  'Реінкарнація',
  'Ретро',
  'Різниця у віці',
  'Саб-дом',
  'Садизм-мазохізм',
  'Самураї',
  'Система',
  'Старший актив',
  'Старший пасив',
  'Стрибок у часі',
  'Суперсили',
  'Сучасність',
  'Тентаклі',
  'Трансгендери',
  'Фетишизм',
  'Цундере',
  'Чарівники',
  'Чудовиська',
  'Шоубіз',
  'Якудзи',
  'Янголи',
  'Яндере',
];

const GENRES_PREF = 'site_hidden_genres';
const LICENSED_PREF = 'site_hide_licensed';

const PREFERENCES: Preference[] = [
  {
    type: 'multiselect',
    key: GENRES_PREF,
    label: 'Приховані категорії',
    description: "Ці категорії завжди будуть приховані в 'Популярне', 'Новинки' та 'Фільтр'.",
    options: GENRES.map((g): FilterOption => ({ label: g, value: g })),
    default: [],
  },
  {
    type: 'switch',
    key: LICENSED_PREF,
    label: 'Скривати ліцензовані твори',
    default: false,
  },
];

interface Title {
  _id: string;
  title: string;
  cover: string;
  genres?: string[];
  type?: string | null;
}

interface Staff {
  name?: string | null;
}

interface TitleDetails extends Title {
  alternativeTitles?: string[] | null;
  description?: string | null;
  translation_status?: string | null;
  tags?: string[] | null;
  authorRef?: Staff[] | null;
  illustratorRef?: Staff[] | null;
  ageRating?: string | null;
}

interface ApiChapter {
  _id: string;
  title: string;
  chapterNumber: number;
  volumeNumber: number;
  chapterName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  teams?: Staff[] | null;
}

const TYPES: Record<string, string> = {
  manga: 'Манґа',
  manhwa: 'Манхва',
  manhua: 'Маньхва',
  western: 'Вестерн',
  Мальописи: 'Мальопис',
  novel: 'Новела',
};

const STATUS: Record<string, MangaStatus> = {
  Покинуто: 'cancelled',
  Завершено: 'completed',
  Перекладається: 'ongoing',
};

const get = async <T>(url: string): Promise<T> => JSON.parse((await http.get(url, { headers })).body) as T;

const idOf = (url: string) =>
  url
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .split('/')
    .pop() ?? '';

function toSummary(title: Title, ignoredGenres: string[]): MangaSummary | null {
  // Hide manga by the genres from the settings, and novels.
  if (title.genres?.some((genre) => ignoredGenres.includes(genre))) return null;
  if (title.type === 'novel') return null;
  return { url: `/title/${title._id}`, title: title.title, thumbnailUrl: title.cover };
}

async function catalog(
  page: number,
  sortBy: string,
  query?: string,
  filters?: Record<string, unknown>,
): Promise<MangaPage> {
  const params: [string, string][] = [
    ['page', String(page)],
    ['limit', '28'],
  ];
  if (query) params.push(['q', query]);
  if (filters) {
    const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');
    const checked = (prefix: string) =>
      Object.entries(filters)
        .filter(([id, v]) => id.startsWith(prefix) && v === true)
        .map(([id]) => id.slice(prefix.length));
    if (text('order')) params.push(['sort', text('order')]);
    if (text('type')) params.push(['type', text('type')]);
    if (text('status')) params.push(['status', text('status')]);
    if (text('translation_status')) params.push(['translation_status', text('translation_status')]);
    const genres = checked('genre.');
    if (genres.length) params.push(['genres', genres.join(',')]);
    const tags = checked('tag.');
    if (tags.length) params.push(['tags', tags.join(',')]);
    if (text('licensed')) params.push(['isLicensed', text('licensed')]);
  } else {
    if (prefs.get<boolean>(LICENSED_PREF) ?? false) params.push(['isLicensed', 'false']);
    params.push(['sort', sortBy]);
  }
  const url = `${API_URL}/titles?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
  const data = await get<{ titles: Title[]; page: number; totalPages: number }>(url);
  const ignored = prefs.get<string[]>(GENRES_PREF) ?? [];
  return {
    items: data.titles.flatMap((t) => toSummary(t, ignored) ?? []),
    hasNextPage: data.totalPages > data.page,
  };
}

const selectFilter = (id: string, label: string, entries: [string, string][], def = ''): Filter => ({
  type: 'select',
  id,
  label,
  options: entries.map(([label, value]) => ({ label, value })),
  default: def,
});

const checkboxes = (id: string, label: string, names: string[]): Filter => ({
  type: 'group',
  id,
  label,
  filters: names.map((name) => ({ type: 'checkbox', id: `${id}.${name}`, label: name })),
});

export default defineExtension({
  preferences: () => PREFERENCES,
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => catalog(page, 'popular'),
    getLatest: (page) => catalog(page, 'updated'),
    search(query, page, filters): Promise<MangaPage> {
      if (query.length > 0 && query.length < 2) {
        throw new Error('Запит має містити щонайменше 2 символи / The query must contain at least 2 characters');
      }
      return catalog(page, 'popular', query || undefined, filters);
    },
    getFilters: (): Filter[] => [
      selectFilter(
        'order',
        'Сортувати за',
        [
          ['Популярністю', 'popular'],
          ['Оновленням', 'updated'],
          ['Алфавітом', 'alphabetical'],
          ['Рейтингом', 'rating'],
        ],
        'rating',
      ),
      checkboxes('genre', 'Жанри', GENRES),
      { type: 'separator' },
      checkboxes('tag', 'Теги', TAGS),
      selectFilter('type', 'Тип', [
        ['Всі', ''],
        ['Манґа', 'manga'],
        ['Манхва', 'manhwa'],
        ['Маньхва', 'manhua'],
        ['Вестерн', 'western'],
        ['Мальопис', 'Мальописи'],
      ]),
      selectFilter('status', 'Статус тайтлу', [
        ['Будь-який статус', ''],
        ['Видається', 'Видається'],
        ['Завершено', 'Завершено'],
        ['Анонс', 'Анонс'],
        ['Призупинено', 'Призупинено'],
      ]),
      selectFilter('translation_status', 'Статус перекладу', [
        ['Будь-який статус', ''],
        ['Перекладається', 'Перекладається'],
        ['Завершено', 'Завершено'],
        ['Покинуто', 'Покинуто'],
      ]),
      selectFilter('licensed', 'Ліцензія', [
        ['Всі', ''],
        ['Тільки ліцензовані', 'true'],
        ['Без ліцензії', 'false'],
      ]),
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const m = await get<TitleDetails>(`${API_URL}/titles/${idOf(manga.url)}`);
      const names = (staff?: Staff[] | null) =>
        staff
          ?.map((s) => String(s.name))
          .join(', ')
          .trim() || undefined;
      return {
        url: `/title/${m._id}`,
        title: m.title,
        thumbnailUrl: m.cover,
        description: `${m.description ?? ''}\n\nАльтернативні назви: ${m.alternativeTitles?.join(',')}`,
        author: names(m.authorRef),
        artist: names(m.illustratorRef),
        genres: [
          ...(m.ageRating ? [m.ageRating] : []),
          TYPES[m.type ?? ''] ?? 'ЧЗХ',
          ...(m.genres ?? []),
          ...(m.tags ?? []),
        ],
        status: STATUS[m.translation_status ?? ''] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const data = await get<ApiChapter[]>(`${API_URL}/chapters/title/${idOf(manga.url)}`);
      return data.map((c) => {
        const volume = String(c.volumeNumber).replace(/\.0$/, '');
        const number = String(c.chapterNumber).replace(/\.0$/, '');
        const scanlator = c.teams?.map((t) => String(t.name)).join(', ');
        return {
          url: `/read/${c.title}/${number}?chapterId=${c._id}`,
          name: `Том ${volume} Розділ ${number} ${c.chapterName ?? ''}`.trim(),
          number: c.chapterNumber,
          scanlator: scanlator || undefined,
          uploadedAt: Date.parse(c.createdAt ?? c.updatedAt ?? '') || undefined,
        };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const chapterId = /[?&]chapterId=([^&]+)/.exec(chapter.url)?.[1] ?? '';
      const data = await get<{ pages: string[] }>(`${API_URL}/chapters/${chapterId}`);
      return data.pages.map((imageUrl, index) => ({ index, imageUrl }));
    },
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
    resolveUrl(url): MangaSummary | null {
      const match = /^https?:\/\/dgmanga\.app\/title\/([^/?#]+)/i.exec(url);
      return match ? { url: `/title/${match[1]}`, title: '' } : null;
    },
  }),
});
