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

const BASE_URL = 'https://astramanga.org';
const API = 'https://api.astramanga.org/api/v1';
const MEDIA = 'https://astramanga.org/media';
const PAGE_SIZE = 30;
const CHAPTERS_PAGE_SIZE = 5000;
const headers = { 'User-Agent': USER_AGENT };

const SORTS: [string, string][] = [
  ['По рейтингу', 'rating'],
  ['По популярности', 'popularity'],
  ['По просмотрам', 'view_count'],
  ['По количеству глав', 'chapter_count'],
  ['По дате выхода', 'released_on'],
  ['По дате обновления', 'updated_at'],
  ['По дате добавления', 'created_at'],
  ['По названию', 'name'],
];
const GENRES: [string, string][] = [
  ['Аниме', '1'],
  ['Антиутопия', '2'],
  ['Апокалиптический', '3'],
  ['Арт', '4'],
  ['Безумие', '5'],
  ['Боевик', '6'],
  ['Боевые искусства', '7'],
  ['Вестерн', '8'],
  ['Военное', '9'],
  ['Выживание', '10'],
  ['Гарем', '11'],
  ['Героическое фэнтези', '12'],
  ['Гуро', '13'],
  ['Гэг-юмор', '14'],
  ['Детектив', '15'],
  ['Детское', '16'],
  ['Дзёсей', '17'],
  ['Драма', '18'],
  ['Завоевание мира', '19'],
  ['Исекай', '20'],
  ['Искусство', '21'],
  ['Исторический', '22'],
  ['Киберпанк', '23'],
  ['Кодомо', '24'],
  ['Комедия', '25'],
  ['Космос', '26'],
  ['Криминал / Преступники', '27'],
  ['Кулинария', '28'],
  ['Культивация', '29'],
  ['Литрес', '30'],
  ['Махо-сёдзё', '31'],
  ['Меха', '32'],
  ['Мистика', '33'],
  ['Мифология', '34'],
  ['Мурим', '35'],
  ['Научная фантастика', '36'],
  ['Образовательная литература', '131'],
  ['Обратный Гарем', '37'],
  ['Омегаверс', '38'],
  ['Пародия', '39'],
  ['Повседневность', '40'],
  ['Постапокалипсис', '41'],
  ['Приключения', '42'],
  ['Психология', '43'],
  ['Регрессия', '44'],
  ['Рисование', '45'],
  ['Романтика', '46'],
  ['Самурайский боевик', '47'],
  ['Сверхъестественное', '48'],
  ['Сёдзе', '49'],
  ['Сёнен', '50'],
  ['Спорт', '51'],
  ['Средневековье', '52'],
  ['Стимпанк', '53'],
  ['Сэйнэн', '54'],
  ['Сянься', '55'],
  ['Трагедия', '56'],
  ['Триллер', '57'],
  ['Ужасы', '58'],
  ['Фантастика', '59'],
  ['Философия', '60'],
  ['Фэнтези', '61'],
  ['Школьная жизнь', '62'],
  ['Экшен', '63'],
  ['Элементы юмора', '64'],
  ['Юмор', '65'],
];
const TAGS: [string, string][] = [
  ['Astramanga Verified', '136'],
  ['Азартные игры', '1'],
  ['Алхимия', '2'],
  ['Ангел', '3'],
  ['Антигерой', '4'],
  ['Аристократия', '5'],
  ['Армия', '6'],
  ['Артефакты', '7'],
  ['Бог', '8'],
  ['Бои на мечах', '10'],
  ['Борьба за власть', '11'],
  ['Брат/сестра', '12'],
  ['Будущее', '13'],
  ['Вампир', '15'],
  ['Ведьма', '16'],
  ['Видеоигры', '17'],
  ['Виртуальная реальность', '18'],
  ['Владыка демонов', '19'],
  ['Война', '20'],
  ['Волшебник / Маг', '21'],
  ['Волшебные существа', '22'],
  ['В основном взрослые', '14'],
  ['Воспоминания из другого мира', '23'],
  ['ГГ женщина', '24'],
  ['ГГ имба', '26'],
  ['ГГ мужчина', '25'],
  ['ГГ не человек', '27'],
  ['Геймеры', '28'],
  ['Гендерная интрига', '127'],
  ['Гильдии', '29'],
  ['Глупый ГГ', '131'],
  ['Гоблин', '30'],
  ['Горничная', '31'],
  ['Грузовик-сан', '32'],
  ['Гурман', '33'],
  ['Гяру', '34'],
  ['Девочки-волшебницы', '35'],
  ['Демонесса', '37'],
  ['Демоны', '36'],
  ['Драконы', '38'],
  ['Дружба', '39'],
  ['Есть аниме-адаптация', '40'],
  ['Жестокий мир', '41'],
  ['Животные компаньоны', '42'],
  ['Зверолюди', '43'],
  ['Злодейка', '44'],
  ['Злой дух', '45'],
  ['Зомби', '46'],
  ['Игра с высокими ставками', '47'],
  ['Игровые элементы', '48'],
  ['Игры', '49'],
  ['Идол', '50'],
  ['ИИ', '135'],
  ['Империи', '51'],
  ['Квесты', '52'],
  ['Китайская одежда', '53'],
  ['Командный спорт', '54'],
  ['Кровь', '55'],
  ['Кроссдрессинг', '128'],
  ['Культура Отаку', '56'],
  ['лгбт на втором плане', '132'],
  ['Легендарное оружие', '57'],
  ['Лоли', '58'],
  ['Любовный многоугольник', '59'],
  ['Магическая академия', '60'],
  ['Магия', '61'],
  ['Мафия', '62'],
  ['Медицина', '63'],
  ['Месть', '64'],
  ['Милые девушки', '65'],
  ['Молодой ГГ', '66'],
  ['Монстр', '67'],
  ['Монстродевушка', '68'],
  ['Музыка', '69'],
  ['Навыки / Способности', '70'],
  ['навязчивая любовь', '71'],
  ['Наёмник', '72'],
  ['Насилие / Жестокость', '73'],
  ['Недоразумения', '74'],
  ['Нежить', '75'],
  ['Ниндзя', '76'],
  ['Обмен телами', '77'],
  ['Оборотни', '78'],
  ['Обратный мир', '134'],
  ['Огнестрельное оружие', '79'],
  ['Офисные работники', '80'],
  ['Официант', '81'],
  ['Пират', '82'],
  ['Подземелье', '83'],
  ['Политика', '84'],
  ['Политический роман', '85'],
  ['Полиция', '86'],
  ['Полноцветный', '262'],
  ['Потеря памяти', '98'],
  ['Преступления', '87'],
  ['Призрак', '88'],
  ['Путешествия во времени', '89'],
  ['Раб', '90'],
  ['Работа', '91'],
  ['Развитие личности', '92'],
  ['Разумные расы', '93'],
  ['Ранги силы', '94'],
  ['Реинкарнация', '95'],
  ['Робот', '96'],
  ['Рыцарь', '97'],
  ['Самурай', '99'],
  ['Свадьба', '100'],
  ['Сводная Сестра/Брат', '133'],
  ['Система', '101'],
  ['Сокрытие личности', '102'],
  ['Спасение мира', '103'],
  ['Спортивное тело', '104'],
  ['Супергерои', '106'],
  ['Супер сила', '105'],
  ['Традиционные игры', '107'],
  ['Умный ГГ', '109'],
  ['Упоротость', '110'],
  ['Управление территорией', '111'],
  ['Учебное заведение', '112'],
  ['Учитель', '113'],
  ['Фермерство', '114'],
  ['Хентай', '124'],
  ['Хикикомори', '115'],
  ['Холодное оружие', '116'],
  ['Шантаж', '117'],
  ['Школа', '118'],
  ['Шоу-бизнес', '119'],
  ['Эльф', '120'],
  ['Эротика', '125'],
  ['Этти', '126'],
  ['юри', '130'],
  ['Якудза', '121'],
  ['Яндере', '122'],
  ['яой', '129'],
  ['Япония', '123'],
];
const TYPES: [string, string][] = [
  ['', 'Все'],
  ['manga', 'Манга'],
  ['manhwa', 'Манхва'],
  ['manhua', 'Маньхуа'],
];
const STATUSES: [string, string][] = [
  ['', 'Любой'],
  ['ongoing', 'Онгоинг'],
  ['completed', 'Завершён'],
  ['paused', 'Приостановлен'],
];

interface Named {
  name?: string | null;
}
interface TitleDto {
  id: number;
  slug: string;
  name: string;
  secondary_name?: string | null;
  alternative_names?: string[] | null;
  cover_image?: string | null;
  cover_versions?: { high?: string | null; mid?: string | null } | null;
  description?: string | null;
  type?: string | null;
  status?: string | null;
  year?: number | null;
  genres?: Named[] | null;
  tags?: Named[] | null;
  publishers?: Named[] | null;
  publishing_house?: Named | null;
}

const typeName = (type: string) =>
  ({ manga: 'Манга', manhwa: 'Манхва', manhua: 'Маньхуа', comics: 'Комикс' })[type] ?? type;

function coverUrl(t: TitleDto): string | undefined {
  const path = t.cover_image ?? t.cover_versions?.mid ?? t.cover_versions?.high;
  return path ? `${MEDIA}/${path}` : undefined;
}

const summary = (t: TitleDto): MangaSummary => ({ url: `/manga/${t.slug}`, title: t.name, thumbnailUrl: coverUrl(t) });
const slugOf = (url: string) => /\/manga\/([^/?#]+)/.exec(url)?.[1] ?? '';

function statusOf(status?: string | null): MangaStatus {
  if (status === 'ongoing') return 'ongoing';
  if (status === 'completed') return 'completed';
  if (status === 'paused') return 'hiatus';
  if (status === 'frozen' || status === 'discontinued') return 'cancelled';
  return 'unknown';
}

async function api<T>(path: string): Promise<T> {
  return (await http.get<{ data: T }>(`${API}${path}`, { headers, responseType: 'json' })).body.data;
}

async function search(page: number, params: [string, string][]): Promise<MangaPage> {
  const all: [string, string][] = [...params, ['page', String(page)], ['page_size', String(PAGE_SIZE)]];
  const data = await api<{ titles: TitleDto[]; total_pages: number; current_page: number }>(
    `/search?${all.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`,
  );
  return { items: data.titles.map(summary), hasNextPage: data.current_page < data.total_pages };
}

const tri = (id: string, label: string, list: [string, string][]): Filter => ({
  type: 'group',
  id,
  label,
  filters: list.map(([text, value]): Filter => ({ type: 'tristate', id: `${id}.${value}`, label: text })),
});
const select = (id: string, label: string, list: [string, string][]): Filter => ({
  type: 'select',
  id,
  label,
  options: list.map(([value, text]) => ({ value, label: text })),
  default: '',
});

const parseTime = (text?: string | null) => {
  const time = text ? Date.parse(text.replace(/(\.\d{3})\d+/, '$1')) : Number.NaN;
  return Number.isNaN(time) ? undefined : time;
};

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => search(page, [['sort', '-popularity']]),
    getLatest: (page) => search(page, [['sort', '-updated_at']]),
    search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params: [string, string][] = [];
      for (const id of ['type', 'status'] as const) {
        const value = filters[id];
        if (typeof value === 'string' && value) params.push([id, value]);
      }
      const sort = filters.sort;
      params.push(['sort', typeof sort === 'object' ? `${sort.ascending ? '' : '-'}${sort.value}` : '-popularity']);
      for (const [prefix, include, exclude] of [
        ['genre', 'genres', 'exclude_genres'],
        ['tag', 'tags', 'exclude_tags'],
      ] as const) {
        for (const [id, state] of Object.entries(filters)) {
          if (!id.startsWith(`${prefix}.`)) continue;
          if (state === 'include') params.push([include, id.slice(prefix.length + 1)]);
          else if (state === 'exclude') params.push([exclude, id.slice(prefix.length + 1)]);
        }
      }
      if (query.trim()) params.push(['query', query.trim()]);
      return search(page, params);
    },
    getFilters: (): Filter[] => [
      {
        type: 'sort',
        id: 'sort',
        label: 'Сортировка',
        options: SORTS.map(([label, value]) => ({ value, label })),
        default: { value: 'popularity', ascending: false },
      },
      tri('genre', 'Жанры', GENRES),
      tri('tag', 'Теги', TAGS),
      select('type', 'Тип', TYPES),
      select('status', 'Статус', STATUSES),
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const t = await api<TitleDto>(`/titles/${slugOf(manga.url)}`);
      const lines: string[] = [];
      if (t.secondary_name?.trim()) lines.push(`Альт. название: ${t.secondary_name}`);
      if (t.alternative_names?.length) lines.push(`Другие названия: ${t.alternative_names.join(', ')}`);
      if (t.year != null) lines.push(`Год выпуска: ${t.year}`);
      const description = `${lines.join('\n')}${lines.length ? '\n\n' : ''}${t.description?.trim() ?? ''}`.trim();
      return {
        ...summary(t),
        author: t.publishing_house?.name ?? t.publishers?.[0]?.name ?? undefined,
        description: description || undefined,
        genres: [
          ...new Set(
            [
              ...(t.type ? [typeName(t.type)] : []),
              ...(t.genres ?? []).map((g) => g.name ?? ''),
              ...(t.tags ?? []).map((g) => g.name ?? ''),
            ].filter((g) => g.trim()),
          ),
        ],
        status: statusOf(t.status),
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const slug = slugOf(manga.url);
      const { id } = await api<TitleDto>(`/titles/${slug}`);
      const { branches } = await api<{
        branches: { id: number; count_chapters?: number | null; name?: string | null }[];
      }>(`/titles/${id}/branches`);
      const chapters: Chapter[] = [];
      for (const branch of branches) {
        const pages = Math.max(Math.ceil((branch.count_chapters ?? 0) / CHAPTERS_PAGE_SIZE), 1);
        for (let page = 1; page <= pages; page++) {
          const data = await api<{
            items: {
              id: number;
              number?: number;
              volume_number?: number | null;
              name?: string | null;
              published_at?: string | null;
            }[];
          }>(`/branches/${branch.id}/chapters?page=${page}&page_size=${CHAPTERS_PAGE_SIZE}`);
          for (const c of data.items) {
            const number = c.number ?? 0;
            const numberStr = String(number).replace(/\.0$/, '');
            const extra = c.name?.trim() && !/^Глава [\d.]+$/.test(c.name) ? ` — ${c.name}` : '';
            chapters.push({
              url: `/manga/${slug}/read/${numberStr}?chapterId=${c.id}`,
              name: `${c.volume_number != null ? `Том ${c.volume_number} ` : ''}Глава ${numberStr}${extra}`,
              number,
              scanlator: branch.name?.trim() || undefined,
              uploadedAt: parseTime(c.published_at),
            });
          }
        }
      }
      return chapters.sort((a, b) => (b.number ?? 0) - (a.number ?? 0) || (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const id = /[?&]chapterId=(\d+)/.exec(chapter.url)?.[1];
      if (!id) throw new Error('Invalid chapter url');
      const data = await api<{ pages: { image_url: string }[] }>(`/chapters/${id}/pages`);
      // page_number is non-sequential (sliced webtoon images): the array order is the reading order.
      return data.pages.map((p, index) => ({ index, imageUrl: p.image_url }));
    },
    imageHeaders: () => ({ 'User-Agent': USER_AGENT }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?astramanga\.org\/manga\/([^/?#]+)/i.exec(url.trim());
      return match ? { url: `/manga/${match[1]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
