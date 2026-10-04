import type { Filter, FilterState } from '@matane/extension-sdk';
import { defineExtension } from '@matane/extension-sdk';
import { MultiChan } from './multichan/MultiChan';
import { withQuery } from './multichan/utils';

// Tag ids are the names with spaces as underscores.
const GENRES = [
  '18_плюс',
  'bdsm',
  'арт',
  'боевик',
  'боевые_искусства',
  'вампиры',
  'веб',
  'гарем',
  'гендерная_интрига',
  'героическое_фэнтези',
  'детектив',
  'дзёсэй',
  'додзинси',
  'драма',
  'игра',
  'инцест',
  'искусство',
  'история',
  'киберпанк',
  'кодомо',
  'комедия',
  'литРПГ',
  'махо-сёдзё',
  'меха',
  'мистика',
  'музыка',
  'научная_фантастика',
  'повседневность',
  'постапокалиптика',
  'приключения',
  'психология',
  'романтика',
  'самурайский_боевик',
  'сборник',
  'сверхъестественное',
  'сказка',
  'спорт',
  'супергерои',
  'сэйнэн',
  'сёдзё',
  'сёдзё-ай',
  'сёнэн',
  'сёнэн-ай',
  'тентакли',
  'трагедия',
  'триллер',
  'ужасы',
  'фантастика',
  'фурри',
  'фэнтези',
  'школа',
  'эротика',
  'юри',
  'яой',
  'ёнкома',
];

const STATUSES = [
  ['', 'Все'],
  ['all_done', 'Перевод завершен'],
  ['end', 'Выпуск завершен'],
  ['ongoing', 'Онгоинг'],
  ['new_ch', 'Новые главы'],
] as const;

const ORDERS = [
  ['date', 'Дата'],
  ['popularity', 'Популярность'],
  ['name', 'Имя'],
  ['chapters', 'Главы'],
] as const;

class MangaChan extends MultiChan {
  readonly name = 'MangaChan';
  readonly baseUrl = 'https://im.manga-chan.me';

  searchMangaUrl(page: number, query: string, filters: FilterState): string {
    const pageNum = Math.max(page, 1);
    if (query) {
      return withQuery(this.baseUrl, {
        do: 'search',
        subaction: 'search',
        story: query,
        search_start: String(pageNum),
      });
    }

    const genres = GENRES.flatMap((genre) => {
      const state = filters[`genre.${genre}`];
      return state === 'include' ? [genre] : state === 'exclude' ? [`-${genre}`] : [];
    }).join('+');
    const status = typeof filters.status === 'string' ? filters.status : '';
    const sort = typeof filters.order === 'object' ? filters.order : { value: 'popularity', ascending: false };
    const index = ORDERS.findIndex(([value]) => value === sort.value);
    // The date order ascending is the site's default listing, which has no status in the query.
    const statusParam = !(sort.ascending && index === 0);
    const offset = `offset=${20 * (pageNum - 1)}`;

    if (genres) {
      const order = sort.ascending
        ? ['', '&n=favasc', '&n=abcdesc', '&n=chasc'][index]
        : ['&n=dateasc', '&n=favdesc', '&n=abcasc', '&n=chdesc'][index];
      return statusParam
        ? `${this.baseUrl}/tags/${genres}${order}?${offset}&status=${status}`
        : `${this.baseUrl}/tags/${status}/${genres}/${order}?${offset}`;
    }
    const order = sort.ascending
      ? ['manga/new', 'manga/new&n=favasc', 'manga/new&n=abcdesc', 'manga/new&n=chasc'][index]
      : ['manga/new&n=dateasc', 'mostfavorites', 'catalog', 'sortch'][index];
    return statusParam
      ? `${this.baseUrl}/${order}?${offset}&status=${status}`
      : `${this.baseUrl}/${order}/${status}?${offset}`;
  }

  getFilters(): Filter[] {
    return [
      {
        type: 'select',
        id: 'status',
        label: 'Статус',
        options: STATUSES.map(([value, label]) => ({ value, label })),
        default: '',
      },
      {
        type: 'sort',
        id: 'order',
        label: 'Сортировка',
        options: ORDERS.map(([value, label]) => ({ value, label })),
        default: { value: 'popularity', ascending: false },
      },
      {
        type: 'group',
        id: 'genres',
        label: 'Тэги',
        filters: GENRES.map((genre): Filter => ({ type: 'tristate', id: `genre.${genre}`, label: genre })),
      },
    ];
  }
}

export default defineExtension({
  createSource: () => new MangaChan().toSource(),
});
