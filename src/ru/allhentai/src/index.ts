import type { FilterData } from './grouple/GroupLe';
import type { HtmlElement } from '@matane/extension-sdk';
import { defineExtension } from '@matane/extension-sdk';
import { GroupLe } from './grouple/GroupLe';

// The site still uses its old search form but the API works: the filter data is fixed, as in Tachiyomi.
const ADDITIONAL: [string, string][] = [
  ['Высокий рейтинг', 'HIGH_RATE'],
  ['Сингл', 'SINGLE'],
  ['Для взрослых', 'MATURE'],
  ['Переведено', 'TRANSLATED'],
  ['Заброшен перевод', 'ABANDONED_POPULAR'],
  ['Длинная', 'MANY_CHAPTERS'],
  ['Ожидает загрузки', 'WAIT_UPLOAD'],
];
const CATEGORIES: [string, string][] = [
  ['3D', '626'],
  ['Анимация', '5777'],
  ['Без текста', '3157'],
  ['Комикс', '1003'],
  ['Манга', '6449'],
  ['Манхва', '1104'],
  ['Маньхуа', '5902'],
  ['Руманга', '5896'],
];
const SORTS: [string, string][] = [
  ['По популярности', 'RATING'],
  ['По алфавиту', 'NAME'],
  ['По году написания', 'YEAR'],
  ['Популярность сейчас', 'POPULARITY'],
  ['По рейтингу', 'USER_RATING'],
  ['Новинки', 'DATE_CREATE'],
  ['По дате обновления', 'DATE_UPDATE'],
];
const STATUSES: [string, string][] = [
  ['Запланирован', 'PLANNED'],
  ['Продолжается', 'PROGRESS'],
  ['Приостановлен', 'POSTPONED'],
  ['Отменён', 'CANCELED'],
  ['Завершён', 'FINISHED'],
  ['Не окончен', 'NON_FINISHED'],
];
const TRANSLATION: [string, string][] = [
  ['Отсутствует', 'NONE'],
  ['Начат', 'STARTED'],
  ['Продолжается', 'PROGRESS'],
  ['Приостановлен', 'POSTPONED'],
  ['Завершён', 'FINISHED'],
  ['Нет необходимости', 'NO_NEED'],
];
const GENRES: [string, string][] = [
  ['Ahegao', '855'],
  ['Анал', '828'],
  ['Бдсм', '78'],
  ['Без цензуры', '888'],
  ['Большая грудь', '837'],
  ['Большая попка', '3156'],
  ['Большой член', '884'],
  ['Бондаж', '5754'],
  ['В первый раз', '811'],
  ['В цвете', '290'],
  ['Гарем', '87'],
  ['Гендарная интрига', '89'],
  ['Групповой секс', '88'],
  ['Драма', '95'],
  ['Зрелые женщины', '5679'],
  ['Измена', '291'],
  ['Изнасилование', '124'],
  ['Инцест', '85'],
  ['Исторический', '93'],
  ['Комедия', '73'],
  ['Маленькая грудь', '870'],
  ['Научная фантастика', '76'],
  ['Нетораре', '303'],
  ['Оральный секс', '853'],
  ['Романтика', '74'],
  ['Тентакли', '69'],
  ['Трагедия', '1321'],
  ['Ужасы', '75'],
  ['Футанари', '77'],
  ['Фэнтези', '70'],
  ['Чикан', '1059'],
  ['Этти', '798'],
];

class AllHentai extends GroupLe {
  readonly name = 'AllHentai';
  readonly baseUrl = 'https://20.allhen.online';

  override tagsSelector = '.cr-tags .cr-tags__item:not(.cr-tags__item--misc) span:not(.text-secondary)';

  override authGuard(document: HtmlElement): void {
    const context = document
      .select('script')
      .map((s) => s.html())
      .filter((s) => s.includes('UI.ViewContext'))
      .join(', ');
    if (context.includes("useContext('blockedForAnonymous") && !document.selectFirst('.user-avatar'))
      throw new Error('Для просмотра контента необходима авторизация (расширение не поддерживает вход)');
  }

  override async fetchFilterData(): Promise<FilterData> {
    const tags = await http.get<{ results?: { text: string; id: string }[] }>(
      `${this.baseUrl}/api/catalog/elementsByType?type=40`,
      { headers: this.apiHeaders(), responseType: 'json' },
    );
    return {
      sortType: SORTS,
      productionStatus: STATUSES,
      tags: tags.body.results?.map((t): [string, string] => [t.text, t.id]),
      translationStatus: TRANSLATION,
      searchFilters: ADDITIONAL,
      genre: GENRES,
      category: CATEGORIES,
      limitation: [],
      another: [],
      years: { min: 1988, max: 2027 },
    };
  }
}

export default defineExtension({
  preferences: () => new AllHentai().preferences(),
  createSource: () => new AllHentai().toSource(),
});
