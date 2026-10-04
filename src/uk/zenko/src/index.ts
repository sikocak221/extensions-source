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
  type SortValue,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT } from './common/utils';

const BASE_URL = 'https://zenko.online';
const API_URL = 'https://api.zenko.online';
const IMG_URL = 'https://storage.zenko.online';
const PAGE_SIZE = 15;

const headers = { 'User-Agent': USER_AGENT };

const ORDERS: [string, string][] = [
  ['По новизні', 'createdAt'],
  ['За датою виходу', 'releaseYear'],
  ['За кількістю переглядів', 'viewsCount'],
  ['За кількістю вподобайок', 'likesCount'],
  ['За останніми оновленнями', 'lastChapterCreatedAt'],
];

const CATEGORIES: [string, string][] = [
  ['Мальопис', 'MANGA_UA'],
  ['Манґа', 'MANGA'],
  ['Манхва', 'MANHVA'],
  ['Маньхва', 'MANHUA'],
  ['Вебкомікс', 'WESTERN_COMICS'],
  ['Комікс', 'COMICS'],
  ['Роман', 'RANOBE'],
  ['Інше', 'OTHER'],
];

const TRANSLATION_STATUSES: [string, string][] = [
  ['Скоро', 'COMING_SOON'],
  ['Перекладається', 'ONGOING'],
  ['Призупинено', 'PAUSED'],
  ['Завершено', 'FINISHED'],
];

const STATUSES: [string, string][] = [
  ['Скоро', 'COMING_SOON'],
  ['Видається', 'ONGOING'],
  ['Призупинено', 'PAUSED'],
  ['Завершено', 'FINISHED'],
];

const AGES: [string, string][] = [
  ['0+', '0'],
  ['16+', '16'],
  ['18+', '18'],
];

const GENRES: [string, string][] = [
  ['Апокаліпсис', 'Апокаліпсис'],
  ['Бойовик', 'Бойовик'],
  ['Бойові мистецтва', 'Бойові мистецтва'],
  ['Ваншот', 'Ваншот'],
  ['Вестерн', 'Вестерн'],
  ['Героїчне фентезі', 'Героїчне фентезі'],
  ['Готика', 'Готика'],
  ['Ґідверс', 'Ґідверс'],
  ['Детектив', 'Детектив'],
  ['Джьосей', 'Джьосей'],
  ['Доджінші', 'Доджінші'],
  ['Драма', 'Драма'],
  ['Екшн', 'Екшн'],
  ['Еротика', 'Еротика'],
  ['Еччі', 'Еччі'],
  ['Жахи', 'Жахи'],
  ['Ісекай', 'Ісекай'],
  ['Історія', 'Історія'],
  ['Йонкома', 'Йонкома'],
  ['Комедія', 'Комедія'],
  ['Махо-шьоджьо', 'Махо-шьоджьо'],
  ['Махо-шьонен', 'Махо-шьонен'],
  ['Меха', 'Меха'],
  ['Містика', 'Містика'],
  ['Надприродне', 'Надприродне'],
  ['Наукова фантастика', 'Наукова фантастика'],
  ['Омегаверс', 'Омегаверс'],
  ['Пародія', 'Пародія'],
  ['Повсякденність', 'Повсякденність'],
  ['Постапокаліпсис', 'Постапокаліпсис'],
  ['Пригоди', 'Пригоди'],
  ['Психологія', 'Психологія'],
  ['Романтика', 'Романтика'],
  ['Сейнен', 'Сейнен'],
  ['Сентай', 'Сентай'],
  ['Спокон', 'Спокон'],
  ['Темне фентезі', 'Темне фентезі'],
  ['Трагедія', 'Трагедія'],
  ['Триллер', 'Триллер'],
  ['Фантастика', 'Фантастика'],
  ['Фентезі', 'Фентезі'],
  ['Філософія', 'Філософія'],
  ['Шьоджьо', 'Шьоджьо'],
  ['Шьоджьо-ай', 'Шьоджьо-ай'],
  ['Шьонен', 'Шьонен'],
  ['Шьонен-ай', 'Шьонен-ай'],
  ['Юрі', 'Юрі'],
  ['Яой', 'Яой'],
];

const TAGS: [string, string][] = [
  ['Авторський роман', 'Авторський роман'],
  ['Альфа/Альфа', 'Альфа/Альфа'],
  ['Альфа/Бета', 'Альфа/Бета'],
  ['Альфа/Омега', 'Альфа/Омега'],
  ['Аристократія', 'Аристократія'],
  ['Артефакти', 'Артефакти'],
  ['БДСМ', 'БДСМ'],
  ['Бета/Альфа', 'Бета/Альфа'],
  ['Божевілля', 'Божевілля'],
  ['Бої ', 'Бої '],
  ['Бої на мечах', 'Бої на мечах'],
  ['Бойовик', 'Бойовик'],
  ['Вагітність', 'Вагітність'],
  ['Вампіри', 'Вампіри'],
  ['Виживання', 'Виживання'],
  ['Від друзів до коханців', 'Від друзів до коханців'],
  ['Від ненависті до кохання', 'Від ненависті до кохання'],
  ['Війна', 'Війна'],
  ['Віртуальна реальність', 'Віртуальна реальність'],
  ['Вороги', 'Вороги'],
  ["Втрата пам'яті", "Втрата пам'яті"],
  ['Гарем', 'Гарем'],
  ['ГГ жінка', 'ГГ жінка'],
  ['ГГ розумний', 'ГГ розумний'],
  ['ГГ чоловік', 'ГГ чоловік'],
  ['Гендерна інтрига', 'Гендерна інтрига'],
  ['Гільдії', 'Гільдії'],
  ['Гобліни', 'Гобліни'],
  ['Демони', 'Демони'],
  ['Діти', 'Діти'],
  ['Для дітей', 'Для дітей'],
  ['Дорослі стосунки', 'Дорослі стосунки'],
  ['Дружба', 'Дружба'],
  ['Друзі дитинства', 'Друзі дитинства'],
  ['Екшн', 'Екшн'],
  ['Ельфи', 'Ельфи'],
  ['Епізод життя', 'Епізод життя'],
  ['Еспер', 'Еспер'],
  ['Жорстокість', 'Жорстокість'],
  ['Західний сетинг', 'Західний сетинг'],
  ['Звіролюди', 'Звіролюди'],
  ['Злочин', 'Злочин'],
  ['Зміна статі', 'Зміна статі'],
  ['Ігри', 'Ігри'],
  ['Імперії', 'Імперії'],
  ['Казка', 'Казка'],
  ['Кіберпанк', 'Кіберпанк'],
  ['Космос', 'Космос'],
  ['Кохання', 'Кохання'],
  ['Кулінарія', 'Кулінарія'],
  ['Культивація', 'Культивація'],
  ['Лікарня', 'Лікарня'],
  ['Любовний трикутник', 'Любовний трикутник'],
  ['Магія', 'Магія'],
  ['Мафія', 'Мафія'],
  ['Медицина', 'Медицина'],
  ['Міфічні істоти', 'Міфічні істоти'],
  ['Молодший семе', 'Молодший семе'],
  ['Молодший уке', 'Молодший уке'],
  ['Монстри', 'Монстри'],
  ['Музика', 'Музика'],
  ['Насилля', 'Насилля'],
  ['Нерозділене кохання', 'Нерозділене кохання'],
  ['Нещасливий фінал', 'Нещасливий фінал'],
  ['Обмін тілами', 'Обмін тілами'],
  ['Одержимість ', 'Одержимість '],
  ['Однолітки', 'Однолітки'],
  ['Омега/Бета', 'Омега/Бета'],
  ['Омега/Омега', 'Омега/Омега'],
  ['Палкий секс', 'Палкий секс'],
  ['Парапсихологія', 'Парапсихологія'],
  ['Перше кохання', 'Перше кохання'],
  ['Підземелля', 'Підземелля'],
  ['Побут', 'Побут'],
  ['Подорожі у часі', 'Подорожі у часі'],
  ['Політика', 'Політика'],
  ['Поліція', 'Поліція'],
  ['Пригоди', 'Пригоди'],
  ['Реінкарнація', 'Реінкарнація'],
  ['Різниця у віці', 'Різниця у віці'],
  ['Різниця у розмірах', 'Різниця у розмірах'],
  ['Рольові ігри', 'Рольові ігри'],
  ['Самураї', 'Самураї'],
  ['Система', 'Система'],
  ['Спорт', 'Спорт'],
  ['Старший семе', 'Старший семе'],
  ['Старший уке', 'Старший уке'],
  ['Суперсила', 'Суперсила'],
  ['Сучасність', 'Сучасність'],
  ['Східний сетинг', 'Східний сетинг'],
  ['Тварини', 'Тварини'],
  ['Університет', 'Університет'],
  ['Фетиш', 'Фетиш'],
  ['Цундере', 'Цундере'],
  ['Чарівники', 'Чарівники'],
  ['Чоловіча вагітність', 'Чоловіча вагітність'],
  ['Чудовиська', 'Чудовиська'],
  ['Школа', 'Школа'],
  ['Шоу-бізнес', 'Шоу-бізнес'],
  ['Щасливий фінал', 'Щасливий фінал'],
  ['Якудза', 'Якудза'],
  ['Яндере', 'Яндере'],
];

const LANGUAGE_PREF = 'TitleLanguagePref';
const GENRES_PREF = 'pref_genres_exclude';
const AGE_PREF = 'site_age_categories';
const CATEGORIES_PREF = 'site_hidden_categories';
const CATEGORIES_DEFAULT = ['RANOBE'];
const EXPLANATION =
  'Усі налаштування приховування та відображення контенту застосовуються до пошуку за назвою, "Популярне" та "Новинки". Пошук без обмежень можливий у "Фільтри"';

const options = (entries: [string, string][]) => entries.map(([label, value]) => ({ label, value }));

const PREFERENCES: Preference[] = [
  {
    type: 'select',
    key: LANGUAGE_PREF,
    label: 'Вибір мови на обкладинці',
    description: 'Якщо мова обкладинки не змінилася, очистіть кеш у програмі',
    options: [
      { label: 'Українська', value: 'ua' },
      { label: 'Англійська', value: 'eng' },
    ],
    default: 'ua',
  },
  {
    type: 'multiselect',
    key: AGE_PREF,
    label: 'Вікові обмеження',
    description: 'Контент з обраними віковими обмеженнями буде відображатися (нічого не обрано: без обмежень)',
    options: options(AGES),
    default: [],
  },
  {
    type: 'multiselect',
    key: GENRES_PREF,
    label: 'Приховані жанри',
    description: 'Виберіть жанри які потрібно сховати',
    options: options(GENRES),
    default: [],
  },
  {
    type: 'multiselect',
    key: CATEGORIES_PREF,
    label: 'Приховані категорії',
    description: EXPLANATION,
    options: options(CATEGORIES),
    default: CATEGORIES_DEFAULT,
  },
];

const language = () => prefs.get<string>(LANGUAGE_PREF) ?? 'ua';
const ageLimit = () => prefs.get<string[]>(AGE_PREF) ?? [];
const hiddenCategories = () => prefs.get<string[]>(CATEGORIES_PREF) ?? CATEGORIES_DEFAULT;
const blockedGenres = () => prefs.get<string[]>(GENRES_PREF) ?? [];

interface TitleItem {
  id: number;
  name: string;
  engName?: string | null;
  coverImg: string;
  category?: string | null;
}

interface Named {
  name: string;
}

interface TitleDetails extends TitleItem {
  description: string;
  translationStatus: string;
  originalName?: string | null;
  genres?: Named[] | null;
  tags?: Named[] | null;
  likesCount?: number | null;
  viewsCount?: number | null;
  bookmarksCount?: number | null;
  writers?: Named[] | null;
  painters?: Named[] | null;
  ageLimit?: number | null;
}

interface ApiChapter {
  createdAt?: number | null;
  id: number;
  name: string | null;
  pages?: { order: number; content: string }[] | null;
  titleId: number | null;
  publisher?: { name?: string | null } | null;
}

const STATUS: Record<string, MangaStatus> = { ongoing: 'ongoing', finished: 'completed', paused: 'hiatus' };

const SEPARATOR = '@#%&;№%#&**#!@';

/** The chapter name packs "part<SEP>chapter<SEP>name". */
function parseName(input: string | null | undefined): { part: string; chapter: string; name: string } {
  const parts = input ? input.split(SEPARATOR) : [];
  if (parts.length === 3) return { part: parts[0]!, chapter: parts[1]!, name: parts[2]! };
  if (parts.length === 2) return { part: parts[0]!, chapter: parts[1]!, name: '' };
  if (parts.length === 1) return { part: '', chapter: '', name: parts[0]! };
  return { part: '', chapter: '', name: '' };
}

/** Sort key by the rule part + chapter (1 + 0 = 100, 1 + 99 = 199, 1 + 100.5 = 1100.5). */
function generateId(input: string | null | undefined): number {
  if (!input) return -1;
  const { part, chapter } = parseName(input);
  const partNumber = Number.parseInt(part, 10) || 0;
  const chapterNumber = Number(chapter);
  let formatted: string;
  if (chapter.includes('.')) {
    const pieces = chapter.split('.');
    formatted = pieces.map((p) => (p === pieces[0] && p.length === 1 ? p.padStart(2, '0') : p)).join('.');
  } else {
    formatted = chapter.length === 1 ? chapter.padStart(2, '0') : chapter;
  }
  const id =
    partNumber > 0 ? `${partNumber}${formatted}` : String(Number.isNaN(chapterNumber) || !chapter ? 0 : chapterNumber);
  return id.trim() !== '' && !Number.isNaN(Number(id)) ? Number(id) : -1;
}

function formatName(input: string | null | undefined): string {
  const { part, chapter, name } = parseName(input);
  const label = chapter ? `Розділ ${chapter}${name ? ':' : ''}` : '';
  return [part ? `Том ${part}` : '', label, name].filter(Boolean).join(' ');
}

const get = async <T>(url: string): Promise<T> => JSON.parse((await http.get(url, { headers })).body) as T;

const titleOf = (m: TitleItem) => (language() === 'eng' && m.engName ? m.engName : m.name);

const toSummary = (m: TitleItem): MangaSummary => ({
  url: `/titles/${m.id}`,
  title: titleOf(m),
  thumbnailUrl: `${IMG_URL}/${m.coverImg}`,
});

const idOf = (url: string) => url.substring(url.indexOf('titles/') + 'titles/'.length).split('/')[0]!;

function yearParam(input: string, fallback: number, min: number, max: number): string {
  const value = Number.parseInt(input.trim(), 10);
  return Number.isNaN(value) || value < min || value > max ? String(fallback) : String(value);
}

async function catalog(page: number, sortBy: string, query?: string, filters?: FilterState): Promise<MangaPage> {
  const params: [string, string][] = [
    ['limit', String(PAGE_SIZE)],
    ['offset', String((page - 1) * PAGE_SIZE)],
  ];
  const currentYear = new Date().getUTCFullYear();
  if (filters) {
    const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string).trim() : '');
    // A checkbox group where unset boxes take their default (the preferences pre-check some).
    const checked = (prefix: string, all: [string, string][], isDefault: (value: string) => boolean) =>
      all
        .map(([, value]) => value)
        .filter((value) => {
          const state = filters[`${prefix}.${value}`];
          return state === undefined ? isDefault(value) : state === true;
        })
        .filter(Boolean);
    const tri = (prefix: string, state: 'include' | 'exclude') =>
      Object.entries(filters)
        .filter(([id, v]) => id.startsWith(`${prefix}.`) && v === state)
        .map(([id]) => id.slice(prefix.length + 1));
    const order = filters.order as SortValue | undefined;
    params.push(['sortBy', order?.value ?? 'viewsCount'], ['order', order?.ascending ? 'ASC' : 'DESC']);
    const join = (name: string, values: string[]) => values.length && params.push([name, values.join(',')]);
    join(
      'categories',
      checked('category', CATEGORIES, (v) => !hiddenCategories().includes(v)),
    );
    join(
      'status',
      checked('status', STATUSES, () => false),
    );
    join(
      'translationStatus',
      checked('translation', TRANSLATION_STATUSES, () => false),
    );
    const genresIn = tri('genre', 'include');
    join('genres', genresIn);
    join(
      'excludeGenres',
      [...new Set([...tri('genre', 'exclude'), ...blockedGenres()])].filter((g) => !genresIn.includes(g)),
    );
    join('tags', tri('tag', 'include'));
    join('excludeTags', tri('tag', 'exclude'));
    join(
      'ageLimit',
      checked('age', AGES, (v) => ageLimit().includes(v)),
    );
    if (text('year_from')) params.push(['releaseYearFrom', yearParam(text('year_from'), 1980, 1980, currentYear)]);
    if (text('year_to')) params.push(['releaseYearTo', yearParam(text('year_to'), currentYear, 1980, currentYear)]);
  } else {
    params.push(['sortBy', sortBy], ['order', 'DESC']);
    if (hiddenCategories().length) {
      params.push([
        'categories',
        CATEGORIES.map(([, v]) => v)
          .filter((v) => !hiddenCategories().includes(v))
          .join(','),
      ]);
    }
    if (ageLimit().length) params.push(['ageLimit', ageLimit().join(',')]);
    if (blockedGenres().length) params.push(['excludeGenres', blockedGenres().join(',')]);
  }
  if (query) params.push(['name', query]);
  const url = `${API_URL}/titles?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
  const result = await get<{ data: TitleItem[]; meta: { hasNextPage: boolean } }>(url);
  return { items: result.data.map(toSummary), hasNextPage: result.meta.hasNextPage };
}

const checkboxes = (
  id: string,
  label: string,
  entries: [string, string][],
  isDefault: (v: string) => boolean = () => false,
): Filter => ({
  type: 'group',
  id,
  label,
  filters: entries.map(([name, value]) => ({
    type: 'checkbox',
    id: `${id}.${value}`,
    label: name,
    default: isDefault(value),
  })),
});

const tristates = (id: string, label: string, entries: [string, string][]): Filter => ({
  type: 'group',
  id,
  label,
  filters: entries.map(([name, value]) => ({ type: 'tristate', id: `${id}.${value}`, label: name })),
});

export default defineExtension({
  preferences: () => PREFERENCES,
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => catalog(page, 'viewsCount'),
    getLatest: (page) => catalog(page, 'lastChapterCreatedAt'),
    search(query, page, filters): Promise<MangaPage> {
      if (query.length > 0 && query.length < 2) {
        throw new Error('Запит має містити щонайменше 2 символи / The query must contain at least 2 characters');
      }
      return catalog(page, 'viewsCount', query || undefined, filters);
    },
    getFilters: (): Filter[] => [
      {
        type: 'sort',
        id: 'order',
        label: 'Сортувати за',
        options: options(ORDERS),
        default: { value: 'viewsCount', ascending: false },
      },
      checkboxes('category', 'Категорії', CATEGORIES, (v) => !hiddenCategories().includes(v)),
      checkboxes('status', 'Статус тайтлу', STATUSES),
      checkboxes('translation', 'Статус перекладу', TRANSLATION_STATUSES),
      checkboxes('age', 'Вікові обмеження', AGES, (v) => ageLimit().includes(v)),
      tristates('genre', 'Жанри', GENRES),
      tristates('tag', 'Теги', TAGS),
      {
        type: 'group',
        id: 'year',
        label: 'Дата виходу',
        filters: [
          { type: 'text', id: 'year_from', label: 'Від' },
          { type: 'text', id: 'year_to', label: 'До' },
        ],
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const m = await get<TitleDetails>(`${API_URL}/titles/${idOf(manga.url)}`);
      const lang = language();
      let description = `${m.description}\n`;
      if (lang === 'ua') {
        description += '\nАльтернативні назви:';
        if (m.engName) description += ` ${m.engName},`;
        if (m.originalName) description += ` ${m.originalName}`;
      }
      if (m.likesCount != null) description += `\nВподобайок: ${m.likesCount} `;
      if (m.viewsCount != null) description += `\nПереглядів: ${m.viewsCount} `;
      if (m.bookmarksCount != null) description += `\nВ закладинках у: ${m.bookmarksCount} `;
      const names = (list?: Named[] | null) => list?.map((n) => n.name).join(', ') || undefined;
      return {
        ...toSummary(m),
        title: titleOf(m),
        description,
        genres: [
          ...(m.ageLimit ? [`${m.ageLimit}+`] : []),
          ...(m.genres ?? []).map((g) => g.name),
          ...(m.tags ?? []).map((t) => t.name),
        ],
        author: names(m.writers),
        artist: names(m.painters),
        status: STATUS[m.translationStatus.toLowerCase()] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const data = await get<ApiChapter[]>(`${API_URL}/titles/${idOf(manga.url)}/chapters`);
      const key = (c: ApiChapter) => {
        const id = generateId(c.name);
        return id > 0 ? id : c.id;
      };
      return data
        .slice()
        .sort((a, b) => key(b) - key(a))
        .map((c) => {
          const chapter = parseName(c.name).chapter;
          return {
            url: `/titles/${c.titleId}/${c.id}`,
            name: formatName(c.name),
            number: chapter && !Number.isNaN(Number(chapter)) ? Number(chapter) : undefined,
            scanlator: c.publisher?.name || undefined,
            uploadedAt: c.createdAt ? c.createdAt * 1000 : undefined,
          };
        });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const chapterId = chapter.url.substring(chapter.url.indexOf('titles/') + 'titles/'.length).split('/')[1];
      const data = await get<ApiChapter>(`${API_URL}/chapters/${chapterId}`);
      return (data.pages ?? [])
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((p, index) => ({ index, imageUrl: `${IMG_URL}/${p.content}` }));
    },
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
    resolveUrl(url): MangaSummary | null {
      const match = /^https?:\/\/zenko\.online\/titles\/(\d+)/i.exec(url);
      return match ? { url: `/titles/${match[1]}`, title: '' } : null;
    },
  }),
});
