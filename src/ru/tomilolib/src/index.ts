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

const BASE_URL = 'https://tomilo-lib.ru';
const API = `${BASE_URL}/api`;
const CDN_URL = 'https://tomilolib.s3.regru.cloud';
const PAGE_LIMIT = 30;
const CHAPTERS_PER_PAGE = 200;
const PREF_SHOW_ADULT = 'pref_show_adult';
const PREF_HIDE_PAID = 'pref_hide_paid';
// API calls only: the CDN answers 403 to image requests that ask for JSON.
const apiHeaders = { 'User-Agent': USER_AGENT, Accept: 'application/json' };

const TYPES = [
  ['', 'Все'],
  ['manga', 'Манга'],
  ['manhwa', 'Манхва'],
  ['manhua', 'Маньхуа'],
  ['comic', 'Комикс'],
] as const;
const STATUSES = [
  ['', 'Любой'],
  ['ongoing', 'Онгоинг'],
  ['completed', 'Завершён'],
  ['pause', 'Приостановлен'],
] as const;
const SORTS = [
  ['views', 'Популярное'],
  ['updatedAt', 'Дата обновления'],
  ['createdAt', 'Дата добавления'],
  ['averageRating', 'Рейтинг'],
  ['name', 'По алфавиту'],
  ['releaseYear', 'Год выпуска'],
  ['totalChapters', 'Кол-во глав'],
] as const;
// The site's full genre list (it filters by exact name).
const GENRES = [
  'Азартные игры',
  'Алхимия',
  'Альтернативное настоящее',
  'Амнезия / Потеря памяти',
  'Ангелы',
  'Антигерой',
  'Апокалиптический',
  'Аристократия',
  'Армия',
  'Артефакты',
  'Безумие',
  'Бейсбол',
  'Бог',
  'Боги',
  'Боевик',
  'Боевое',
  'Боевые искусства',
  'Бои на мечах',
  'Борьба за власть',
  'Будущее',
  'Вампиры',
  'Ведьма',
  'Видеоигры',
  'Виртуальная реальность',
  'Владыка демонов',
  'Военный',
  'Война',
  'Волшебник / Маг',
  'Волшебные существа',
  'Всесильный главный герой',
  'Выживание',
  'Гарем',
  'Геймеры',
  'Героическое фэнтези',
  'Гильдии',
  'Главная героиня',
  'Главный герой мужчина',
  'Гоблины',
  'Горничная',
  'Городское фэнтези',
  'Гурман',
  'Гэг-юмор',
  'Гяру',
  'Девочки-волшебницы',
  'Девушки-монстры',
  'Демоны',
  'Детектив',
  'Дзёсей',
  'Драконы',
  'Драма',
  'Дружба',
  'Жестокий мир',
  'Завоевание мира',
  'Зверолюди',
  'Злодейка',
  'Зомби',
  'Игровые элементы',
  'Игры',
  'Империи',
  'Исекай',
  'Исторический',
  'История',
  'Киберпанк',
  'Комедия',
  'Королевские дела',
  'Космос',
  'Криминал / Преступники',
  'Кровь',
  'Культивация',
  'Легендарное оружие',
  'Лоли',
  'Магическая академия',
  'Магические существа',
  'Магия',
  'Мафия',
  'Медицина',
  'Месть',
  'Меха',
  'Милфы',
  'Мистика',
  'Монстры',
  'Мурим',
  'Навыки',
  'Наёмники',
  'Насилие',
  'Научная фантастика',
  'Нежить',
  'Ниндзя',
  'Обмен телами',
  'Огнестрельное оружие',
  'Отношения',
  'Офисные работники',
  'Пародия',
  'Перерождение',
  'Подземелье',
  'Политика',
  'Полиция',
  'Постапокалиптический',
  'Психологическое',
  'Путешествие во времени',
  'Рабы',
  'Ранги силы',
  'Регрессия',
  'Реинкарнация',
  'Робот',
  'Романтика',
  'Рыцари',
  'Самурай',
  'Сверхъестественное',
  'Сёдзё',
  'Секс',
  'Сёнэн',
  'Система',
  'Скрытие личности',
  'Спасение мира',
  'Спорт',
  'Средневековье',
  'Старшая школа',
  'Супер сила',
  'Супергерои',
  'Сэйнэн',
  'Сянься',
  'Трагедия',
  'Триллер',
  'Ужасы',
  'Умный главный герой',
  'Управление территорией',
  'Учитель',
  'Фантастика',
  'Фехтование',
  'Философия',
  'Фэнтези',
  'Хентай',
  'Хоррор',
  'Хулиганы',
  'Цундэрэ',
  'Шантаж',
  'Школа',
  'Школьная жизнь',
  'Шоу-бизнес',
  'Экшен',
  'Элементы юмора',
  'Эльфы',
  'Эротика',
  'Этти',
  'Якудза',
  'Яндере',
  'Япония',
];

interface TitleDto {
  _id: string;
  name: string;
  slug?: string;
  altNames?: string[];
  description?: string;
  genres?: string[];
  coverImage?: string | null;
  status?: string | null;
  author?: string | null;
  artist?: string | null;
  isAdult?: boolean;
}
interface ChapterDto {
  _id: string;
  chapterNumber?: number;
  name?: string | null;
  releaseDate?: string | null;
  isPublished?: boolean;
  isPaid?: boolean;
  unlockPrice?: number;
  freeAt?: string | null;
}

async function api<T>(path: string): Promise<T> {
  return (await http.get<{ data: T }>(`${API}${path}`, { headers: apiHeaders, responseType: 'json' })).body.data;
}

const parseTime = (text?: string | null): number | undefined => {
  if (!text) return undefined;
  const time = Date.parse(text.replace(/(\.\d{3})\d+/, '$1'));
  return Number.isNaN(time) ? undefined : time;
};

// "/uploads/..." objects are not public on the S3 CDN (403), but the same objects are served without that prefix.
function resolveImageUrl(path?: string | null): string {
  if (!path?.trim()) return '';
  const url = path.startsWith('http') ? path : path.startsWith('/') ? CDN_URL + path : `${CDN_URL}/${path}`;
  if (url.startsWith(`${CDN_URL}/uploads`)) return url.replace(`${CDN_URL}/uploads`, CDN_URL);
  if (url.startsWith(`${BASE_URL}/uploads`)) return url.replace(`${BASE_URL}/uploads`, CDN_URL);
  return url;
}

const summary = (t: TitleDto): MangaSummary => ({
  // The api wants the id, the site the slug.
  url: `/titles/${t.slug ?? ''}/${t._id}`,
  title: t.name.trim(),
  thumbnailUrl: resolveImageUrl(t.coverImage) || undefined,
});

const idOf = (url: string) => url.split('/').pop() ?? '';

function statusOf(status?: string | null): MangaStatus {
  if (status === 'ongoing') return 'ongoing';
  if (status === 'completed') return 'completed';
  if (status === 'pause' || status === 'frozen') return 'hiatus';
  return 'unknown';
}

async function titles(params: [string, string][]): Promise<MangaPage> {
  const data = await api<{ titles: TitleDto[]; pagination: { page: number; pages: number } }>(
    `/titles?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`,
  );
  const showAdult = prefs.get<boolean>(PREF_SHOW_ADULT) ?? false;
  return {
    items: data.titles.filter((t) => showAdult || !t.isAdult).map(summary),
    hasNextPage: data.pagination.page < data.pagination.pages,
  };
}

export default defineExtension({
  preferences: () => [
    {
      type: 'switch',
      key: PREF_SHOW_ADULT,
      label: 'Показывать контент 18+',
      description: 'Включить тайтлы с пометкой 18+ в выдачу',
      default: false,
    },
    {
      type: 'switch',
      key: PREF_HIDE_PAID,
      label: 'Скрывать платные главы',
      description: 'Не показывать ещё не открытые платные главы в списке',
      default: false,
    },
  ],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) =>
      titles([
        ['sortBy', 'views'],
        ['order', 'desc'],
        ['page', String(page)],
        ['limit', String(PAGE_LIMIT)],
      ]),
    getLatest: (page) =>
      titles([
        ['sortBy', 'updatedAt'],
        ['order', 'desc'],
        ['page', String(page)],
        ['limit', String(PAGE_LIMIT)],
      ]),
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params: [string, string][] = [
        ['page', String(page)],
        ['limit', String(PAGE_LIMIT)],
      ];
      if (query.trim()) params.push(['search', query.trim()]);
      for (const id of ['type', 'status'] as const) {
        const value = filters[id];
        if (typeof value === 'string' && value) params.push([id, value]);
      }
      for (const genre of GENRES) if (filters[`genre.${genre}`] === true) params.push(['genres', genre]);
      const sort = filters.sort;
      params.push(
        ['sortBy', typeof sort === 'object' ? sort.value : 'views'],
        ['order', typeof sort === 'object' && sort.ascending ? 'asc' : 'desc'],
      );
      return titles(params);
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'type',
        label: 'Тип',
        options: TYPES.map(([value, label]) => ({ value, label })),
        default: '',
      },
      {
        type: 'select',
        id: 'status',
        label: 'Статус',
        options: STATUSES.map(([value, label]) => ({ value, label })),
        default: '',
      },
      {
        type: 'sort',
        id: 'sort',
        label: 'Сортировка',
        options: SORTS.map(([value, label]) => ({ value, label })),
        default: { value: 'views', ascending: false },
      },
      { type: 'separator' },
      { type: 'header', label: 'Жанры (могут не комбинироваться с текстовым поиском)' },
      {
        type: 'group',
        id: 'genres',
        label: 'Жанры',
        filters: GENRES.map((genre): Filter => ({ type: 'checkbox', id: `genre.${genre}`, label: genre })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const t = await api<TitleDto>(`/titles/${idOf(manga.url)}`);
      const others = (t.altNames ?? []).filter((n) => n.trim());
      const description = [t.description?.trim(), others.length ? `Альтернативные названия: ${others.join(' / ')}` : '']
        .filter(Boolean)
        .join('\n\n');
      return {
        ...summary(t),
        author: t.author ?? undefined,
        artist: t.artist ?? undefined,
        genres: t.genres,
        status: statusOf(t.status),
        description: description || undefined,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const titleId = idOf(manga.url);
      const hidePaid = prefs.get<boolean>(PREF_HIDE_PAID) ?? false;
      const all: ChapterDto[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const data = await api<{ chapters: ChapterDto[]; pagination: { pages: number } }>(
          `/chapters?titleId=${titleId}&page=${page}&limit=${CHAPTERS_PER_PAGE}`,
        );
        all.push(...data.chapters);
        totalPages = data.pagination.pages;
        page++;
      } while (page <= totalPages);
      return all
        .filter((c) => c.isPublished !== false)
        .sort((a, b) => (b.chapterNumber ?? 0) - (a.chapterNumber ?? 0))
        .flatMap((c): Chapter[] => {
          // Locked while the paid chapter is not yet free (no or unreadable date counts as locked).
          const freeAt = parseTime(c.freeAt);
          const locked = !!c.isPaid && (c.unlockPrice ?? 0) > 0 && (freeAt === undefined || freeAt > Date.now());
          if (locked && hidePaid) return [];
          const number = c.chapterNumber ?? 0;
          return [
            {
              url: `/chapters/${c._id}`,
              name: c.name ?? `Глава ${String(number).replace(/\.0$/, '')}`,
              number,
              uploadedAt: parseTime(c.releaseDate),
              scanlator: locked ? '🔒 Платно' : undefined,
            },
          ];
        });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const data = await api<{ pages?: string[]; isPaid?: boolean }>(chapter.url);
      if (!data.pages?.length) {
        if (data.isPaid) throw new Error('Глава платная и ещё не открыта бесплатно');
        return [];
      }
      return data.pages.map((url, index) => ({ index, imageUrl: resolveImageUrl(url) }));
    },
    imageHeaders: () => ({ 'User-Agent': USER_AGENT }),
    getWebUrl: (item) =>
      absoluteUrl(BASE_URL, item.url.startsWith('/titles/') ? item.url.split('/').slice(0, 3).join('/') : item.url),
  }),
});
