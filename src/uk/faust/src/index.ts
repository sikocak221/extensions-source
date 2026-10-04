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

const BASE_URL = 'https://faust-web.com';
const API_URL = `${BASE_URL}/api`;

// Reading 18+ chapters needs a login on the site (cookie session + signed requests), which Matane has no way
// to do: they fail with the site's own message.
const headers = { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json' };

const ORDERS: [string, string][] = [
  ['Оцінками', 'rating'],
  ['Популярністю', 'popularity'],
  ['Алфавітом', 'alphabet'],
  ['Останні оновлення', 'updated'],
  ['Нові тайтли', 'newest'],
];

const TYPES: [string, string][] = [
  ['Всі категорї', ''],
  ['Манґа', 'Manga'],
  ['Манхва', 'Manhwa'],
  ['Маньхва', 'Manhua'],
  ['Ваншот', 'Oneshot'],
  ['Вебкомікс', 'Webcomic'],
  ['Доджінші', 'Doujinshi'],
  ['Екстра', 'Extra'],
  ['Комікс', 'Comics'],
  ['Мальопис', 'Malyopys'],
];

const TRANSLATION_STATUSES: [string, string][] = [
  ['Будь-який статус', ''],
  ['Покинуто', 'Inactive'],
  ['Перекладено', 'Translated'],
  ['Перекладається', 'Active'],
];

const PUBLICATION_STATUSES: [string, string][] = [
  ['Будь-який статус', ''],
  ['Триває', 'Ongoing'],
  ['Призупинено', 'Paused'],
  ['Закінчено', 'Completed'],
  ['Гіатус', 'Hiatus'],
];

const AGE_BRACKETS: [string, string][] = [
  ['Будь-якa категорія', ''],
  ['Для всіх', 'FitForAll'],
  ['13+', 'ThirteenPlus'],
  ['16+', 'SixteenPlus'],
  ['18+', 'AdultsOnly'],
];

// The genre names offered in the preferences (ids are looked up by name).
const GENRE_NAMES = [
  'Авторський роман',
  'Антиутопія',
  'Артефакти',
  'Бої',
  'Бої на мечах',
  'Бойовик',
  'Буденність',
  'Ваншот',
  'Вестерн',
  'Виживання',
  'Вороги',
  'Ґідверс',
  'Детектив',
  'Джьосей',
  'Для дітей',
  'Доджінші',
  'Драма',
  'Ельфи',
  'Епізод життя',
  'Еротика',
  'Еччі',
  'Жахи',
  'Західний сетинг',
  'Злочин',
  'Ігри',
  'Імперії',
  'Ісекай',
  'Історія',
  'Казка',
  'Кіберпанк',
  'Комедія',
  'Кохання',
  'Лікарня',
  'Махо-шьоджьо',
  'Меха',
  'Містика',
  'Міфічні істоти',
  'Молодший семе',
  'Монстри',
  'Надприродне',
  'Насилля',
  'Наукова фантастика',
  'Однолітки',
  'Омегаверс',
  'Пародія',
  'Побут',
  'Повсякденність',
  'Подорожі у часі',
  'Постапокаліпсис',
  'Постапокаліптика',
  'Пригоди',
  'Психологія',
  'Різниця у розмірах',
  'Романтика',
  'Сейнен',
  'Сентай',
  'Спорт',
  'Стімпанк',
  'Трагедія',
  'Трилер',
  'Триллер',
  'Фантастика',
  'Фентезі',
  'Шьоджьо',
  'Шьоджьо-ай',
  'Шьонен',
  'Шьонен-ай',
  'Юрі',
  'Яой',
];

const GENRES_PREF = 'site_hidden_genres';

const PREFERENCES: Preference[] = [
  {
    type: 'multiselect',
    key: GENRES_PREF,
    label: 'Приховані категорії',
    description: "Ці категорії завжди будуть приховані в 'Популярне', 'Новинки' та 'Фільтр'.",
    options: GENRE_NAMES.map((name): FilterOption => ({ label: name, value: name })),
    default: [],
  },
];

interface NamedId {
  id: string;
  name: string;
}

interface Title {
  name: string;
  slug: string;
  coverImageUrl: string;
}

interface Person {
  firstName?: string | null;
  lastName?: string | null;
}

interface ApiChapter {
  name: string;
  slug: string;
  volumeOrder: number;
  number: number;
  updatedDate?: string | null;
  createdDate?: string | null;
  translationTeams?: { name: string }[] | null;
}

interface TitleDetails extends Title {
  description?: string | null;
  artists?: Person[] | null;
  authors?: Person[] | null;
  mangaType?: string | null;
  ageBracket?: string | null;
  tags?: { name: string }[] | null;
  genres?: { name: string }[] | null;
  translationStatus?: string | null;
  averageRating?: number | null;
  bookmarksCount?: number | null;
  englishName?: string | null;
  votesCount?: number | null;
  volumes?: { chapters: ApiChapter[] }[] | null;
}

const TYPE_NAMES: Record<string, string> = {
  Manga: 'Манґа',
  Manhwa: 'Манхва',
  Manhua: 'Маньхва',
  Oneshot: 'Ваншот',
  Webcomic: 'Вебкомікс',
  Doujinshi: 'Доджінші',
  Extra: 'Екстра',
  Comics: 'Комікс',
  Malyopys: 'Мальопис',
};

const AGE_NAMES: Record<string, string> = {
  FitForAll: '0+',
  ThirteenPlus: '13+',
  SixteenPlus: '16+',
  AdultsOnly: '18+',
};

const STATUS: Record<string, MangaStatus> = { Inactive: 'cancelled', Translated: 'completed', Active: 'ongoing' };

const get = async <T>(path: string): Promise<T> =>
  JSON.parse((await http.get(`${API_URL}${path}`, { headers })).body) as T;

let genreIds: NamedId[] | undefined;

/** Ids of the genres hidden in the preferences (the site identifies genres by id). */
async function hiddenGenreIds(): Promise<string[]> {
  const hidden = prefs.get<string[]>(GENRES_PREF) ?? [];
  if (hidden.length === 0) return [];
  genreIds ??= (await get<{ items: NamedId[] }>('/genres/paged?page=1&pageSize=100')).items;
  return genreIds.filter((g) => hidden.includes(g.name)).map((g) => g.id);
}

async function listGenreOptions(path: string): Promise<FilterOption[]> {
  const result = await get<{ items: NamedId[] }>(path);
  return result.items.map((g) => ({ label: g.name, value: g.id }));
}

/** A range value inside [min, max]; anything else falls back to the bound (a blank box is not sent). */
function range(input: string | undefined, min: number, max: number, fallback: number): string | undefined {
  if (!input?.trim()) return undefined;
  const value = Number.parseInt(input.trim(), 10);
  return String(Number.isNaN(value) || value < min || value > max ? fallback : value);
}

async function listing(page: number, sort: string | null, query = '', filters?: FilterState): Promise<MangaPage> {
  const checkYear = new Date().getUTCFullYear() + 1;
  const body: Record<string, unknown> = { searchQuery: query, page, pageSize: 30 };
  if (filters) {
    const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string).trim() : '');
    const ids = (prefix: string, state: 'include' | 'exclude') =>
      Object.entries(filters)
        .filter(([id, v]) => id.startsWith(prefix) && v === state)
        .map(([id]) => id.slice(prefix.length));
    const order = filters.order as SortValue | undefined;
    if (order) body.sortBy = `${order.ascending ? '-' : '+'}${order.value}`;
    if (text('type')) body.mangaType = text('type');
    if (text('translation')) body.translationStatus = text('translation');
    if (text('publication')) body.publicationStatus = text('publication');
    if (text('age')) body.ageBracket = text('age');
    const yearFrom = range(text('year_from'), 1970, checkYear, 1970);
    const yearTo = range(text('year_to'), 1970, checkYear, checkYear);
    const minChapters = range(text('chapters_from'), 0, 3000, 0);
    const maxChapters = range(text('chapters_to'), 0, 3000, 3000);
    if (yearFrom) body.yearFrom = yearFrom;
    if (yearTo) body.yearTo = yearTo;
    if (minChapters) body.minChapters = minChapters;
    if (maxChapters) body.maxChapters = maxChapters;
    // Genres hidden in the preferences are excluded unless the filter includes them.
    const genresIn = ids('genre.', 'include');
    const genresOut = [...new Set([...ids('genre.', 'exclude'), ...(await hiddenGenreIds())])].filter(
      (g) => !genresIn.includes(g),
    );
    if (genresIn.length) body.genreIds = genresIn;
    if (genresOut.length) body.excludeGenreIds = genresOut;
    if (ids('tag.', 'include').length) body.tagIds = ids('tag.', 'include');
    if (ids('tag.', 'exclude').length) body.excludeTagIds = ids('tag.', 'exclude');
  } else {
    const hidden = await hiddenGenreIds();
    if (hidden.length) body.excludeGenreIds = hidden;
    body.sortBy = sort;
  }
  const response = await http.post(`${API_URL}/titles/search/library`, { json: body }, { headers });
  const data = JSON.parse(response.body) as { page?: number; totalPages?: number; titles: Title[] };
  return {
    items: data.titles.map((t) => ({ url: `/manga/${t.slug}`, title: t.name, thumbnailUrl: t.coverImageUrl })),
    hasNextPage: (data.totalPages ?? 0) > (data.page ?? 0),
  };
}

const slugOf = (url: string) => url.replace(/\/+$/, '').split('/').pop() ?? '';
const person = (p: Person) => `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
const trimZero = (n: number) => String(n).replace(/\.0$/, '');

const selectFilter = (id: string, label: string, entries: [string, string][]): Filter => ({
  type: 'select',
  id,
  label,
  options: entries.map(([label, value]) => ({ label, value })),
  default: '',
});

const tristates = (id: string, label: string, options: FilterOption[]): Filter => ({
  type: 'group',
  id,
  label,
  filters: options.map((o) => ({ type: 'tristate', id: `${id}.${o.value}`, label: o.label })),
});

const rangeGroup = (id: string, label: string): Filter => ({
  type: 'group',
  id,
  label,
  filters: [
    { type: 'text', id: `${id}_from`, label: 'Від' },
    { type: 'text', id: `${id}_to`, label: 'До' },
  ],
});

export default defineExtension({
  preferences: () => PREFERENCES,
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => listing(page, '-popularity'),
    getLatest: (page) => listing(page, '+updated'),
    search: (query, page, filters) => listing(page, null, query, filters),
    async getFilters(): Promise<Filter[]> {
      const [genres, tags] = await Promise.all([
        listGenreOptions('/genres/paged?page=1&pageSize=100').catch(() => []),
        listGenreOptions('/tags/paged?page=1&pageSize=150').catch(() => []),
      ]);
      const filters: Filter[] = [
        {
          type: 'sort',
          id: 'order',
          label: 'Сортувати за',
          options: ORDERS.map(([label, value]) => ({ label, value })),
          default: { value: 'popularity', ascending: true },
        },
        { type: 'separator' },
      ];
      if (genres.length) filters.push(tristates('genre', 'Жанри', genres), { type: 'separator' });
      if (tags.length) filters.push(tristates('tag', 'Теги', tags), { type: 'separator' });
      filters.push(
        selectFilter('type', 'Тип', TYPES),
        selectFilter('translation', 'Статус перекладу', TRANSLATION_STATUSES),
        selectFilter('publication', 'Статус виходу', PUBLICATION_STATUSES),
        selectFilter('age', 'Вікова категорія', AGE_BRACKETS),
        { type: 'separator' },
        rangeGroup('chapters', 'Кількість розділів'),
        { type: 'separator' },
        rangeGroup('year', 'Рік виходу'),
      );
      return filters;
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const m = await get<TitleDetails>(`/titles/${slugOf(manga.url)}`);
      const age = AGE_NAMES[m.ageBracket ?? ''];
      return {
        url: `/manga/${m.slug}`,
        title: m.name,
        thumbnailUrl: m.coverImageUrl,
        description:
          `${m.description ?? ''}\n\nАльтернативні назви: ${m.englishName ?? ''}` +
          `\nРейтинг: ${(m.averageRating ?? 0).toFixed(2)}/5 (${m.votesCount ?? 0}), В закладках: ${m.bookmarksCount ?? 0}`,
        artist: m.artists?.map(person).join(', ') || undefined,
        author: m.authors?.map(person).join(', ') || undefined,
        genres: [
          ...(age ? [age] : []),
          TYPE_NAMES[m.mangaType ?? ''] ?? 'ЧЗХ',
          ...(m.genres ?? []).map((g) => g.name),
          ...(m.tags ?? []).map((t) => t.name),
        ],
        status: STATUS[m.translationStatus ?? ''] ?? 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const slug = slugOf(manga.url);
      const m = await get<TitleDetails>(`/titles/${slug}`);
      return (m.volumes ?? [])
        .flatMap((volume) => volume.chapters)
        .map((c): Chapter => {
          const volume = trimZero(c.volumeOrder);
          const name = c.name.includes('Розділ')
            ? `Том ${volume} ${c.name}`
            : `Том ${volume} Розділ ${trimZero(c.number)} ${c.name}`;
          return {
            url: `${c.slug}/${slug}`,
            name: name.trim(),
            number: c.number,
            scanlator: c.translationTeams?.map((t) => t.name).join(', ') || undefined,
            uploadedAt: Date.parse(c.updatedDate ?? c.createdDate ?? '') || undefined,
          };
        })
        .reverse();
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const [chapterSlug, seriesSlug] = chapter.url.split('/');
      const response = await http.request<string>({
        url: `${API_URL}/chapters/${chapterSlug}?titleSlug=${seriesSlug}`,
        headers,
      });
      if (response.status < 200 || response.status >= 300) {
        if (response.status === 403 && response.body.includes('необхідно увійти')) {
          throw new Error(
            'Для перегляду розділів 18+ необхідно увійти до облікового запису на сайті (недоступно у Matane).',
          );
        }
        throw new Error(`HTTP ${response.status}`);
      }
      const data = JSON.parse(response.body) as { pages: { blobName: string; pageNumber: number }[] };
      return data.pages
        .slice()
        .sort((a, b) => a.pageNumber - b.pageNumber)
        .map((p, index) => ({ index, imageUrl: p.blobName }));
    },
    getWebUrl(item): string {
      if (item.url.startsWith('/manga/')) return `${BASE_URL}${item.url}`;
      const [chapterSlug, seriesSlug] = item.url.split('/');
      const pieces = chapterSlug!.split('-');
      return `${BASE_URL}/manga/${seriesSlug}/${pieces[0]}-${pieces[1]}/${pieces[2]}-${pieces[3]}`;
    },
    resolveUrl(url): MangaSummary | null {
      const match = /^https?:\/\/faust-web\.com\/manga\/([^/?#]+)/i.exec(url);
      return match ? { url: `/manga/${match[1]}`, title: '' } : null;
    },
  }),
});
