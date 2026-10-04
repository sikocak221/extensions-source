import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, imgAttr, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://mangapoisk.me';
const headers = { 'User-Agent': USER_AGENT };

const ORDERS: [string, string][] = [
  ['year', 'Год'],
  ['popular', 'Популярность'],
  ['name', 'Алфавит'],
  ['published_at', 'Дата добавления'],
  ['last_chapter_at', 'Дата обновления'],
  ['chapters_count', 'Количество глав'],
];
const STATUSES: [string, string][] = [
  ['0', 'Выпускается'],
  ['1', 'Завершена'],
];
const GENRES: [string, string][] = [
  ['Арт', '7332'],
  ['Боевик', '3'],
  ['Боевые искусства', '31'],
  ['Вампиры', '10'],
  ['Гарем', '29'],
  ['Гендерная интрига', '172'],
  ['Героическое фэнтези', '30'],
  ['Детектив', '121'],
  ['Дзёсэй', '230'],
  ['Додзинси', '1785'],
  ['Драма', '6'],
  ['Игра', '105'],
  ['Исэкай', '8120'],
  ['Исторя', '123'],
  ['Киберпанк', '355'],
  ['Комедия', '4'],
  ['Кодомо', '1789'],
  ['Махо-сёдзё', '1472'],
  ['Меха', '356'],
  ['Музыка', '34948'],
  ['Научная фантастика', '171'],
  ['Образование', '987'],
  ['Омегаверс', '7514'],
  ['Пародия', '34402'],
  ['Повседневность', '18'],
  ['Повседневность', '10163'],
  ['Постапокалиптика', '310'],
  ['Постапокалиптика', '44805'],
  ['Приключения', '1'],
  ['Психология', '38'],
  ['Романтика', '2'],
  ['Самурайский боевик', '916'],
  ['Сверхъестественное', '5'],
  ['Сёдзё', '57'],
  ['Сёдзё-ай', '147'],
  ['Сёнэн', '8'],
  ['Сэйнэн', '12'],
  ['Спорт', '160'],
  ['Триллер', '120'],
  ['Трагедия', '122'],
  ['Уся', '10128'],
  ['Ужасы', '260'],
  ['Фэнтези', '7'],
  ['Школа', '11'],
  ['Щанься', '9321'],
];

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/** "5 минут назад", "2 часа назад", "3 дня назад" or "05 марта 2020". */
function parseDate(text: string): number | undefined {
  const amount = Number.parseInt(text.split(' ')[0] ?? '', 10);
  if (!Number.isNaN(amount)) {
    if (text.includes('минут')) return Date.now() - amount * 60_000;
    if (text.includes('час')) return Date.now() - amount * 3_600_000;
    if (text.includes('дня') || text.includes('дней')) return Date.now() - amount * 86_400_000;
  }
  const match = /(\d{1,2})\s+([^\s\d]+)\s+(\d{4})/.exec(text);
  const month = match ? MONTHS.indexOf(match[2]!.toLowerCase()) : -1;
  return match && month >= 0 ? Date.UTC(Number(match[3]), month, Number(match[1])) : undefined;
}

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function parseList(document: HtmlElement, isSearch: boolean): MangaPage {
  const items = document.select(isSearch ? 'article.card' : '.manga-card').flatMap((element): MangaSummary[] => {
    const link = isSearch ? element.selectFirst('a.card-about') : element.selectFirst('a');
    if (!link) return [];
    const title = (
      isSearch
        ? element.selectFirst('div.post-description p.card-title')?.text().trim() ||
          element.selectFirst('a > h2.entry-title')?.text().trim()
        : link.attr('title')?.trim()
    )?.split('/')[0];
    if (!title) return [];
    return [
      {
        url: relativeUrl(link.attr('href') ?? ''),
        title,
        thumbnailUrl: imgAttr(element.selectFirst('a > img'), ['data-src', 'src']) || undefined,
      },
    ];
  });
  const hasNextPage = isSearch
    ? document.selectFirst('ul.pagination li a[aria-label*=Вперёд]:not([aria-disabled=true])') !== null
    : selectIgnoreCase(document, 'ul li:contains(Вперёд) a').length > 0;
  return { items, hasNextPage };
}

async function catalog(page: number, sortBy: string, filters?: FilterState): Promise<MangaPage> {
  const params: [string, string][] = [];
  if (filters) {
    const sorting = filters.order;
    if (sorting && typeof sorting === 'object') {
      // Name and popularity sort ascending with a minus sign, the others the other way round.
      const flip = sorting.value === 'name' || sorting.value === 'popular' ? sorting.ascending : !sorting.ascending;
      params.push(['sortBy', `${flip ? '-' : ''}${sorting.value}`]);
    } else params.push(['sortBy', 'popular']);
    const pick = (prefix: string, state: string) =>
      Object.entries(filters)
        .filter(([id, value]) => id.startsWith(`${prefix}.`) && value === state)
        .map(([id]) => id.slice(prefix.length + 1));
    const translated = Object.entries(filters)
      .filter(([id, value]) => id.startsWith('status.') && value === true)
      .map(([id]) => id.slice('status.'.length));
    if (translated.length) params.push(['translated', `[${translated.join(',')}]`]);
    const included = pick('genre', 'include');
    const excluded = pick('genre', 'exclude');
    if (included.length) params.push(['genres', `[${included.join(',')}]`]);
    if (excluded.length) params.push(['genres-exclude', `[${excluded.join(',')}]`]);
  } else params.push(['sortBy', sortBy]);
  params.push(['page', String(page)]);
  const document = await load(`${BASE_URL}/manga?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`);
  return parseList(document, false);
}

function chapterFromElement(element: HtmlElement): Chapter | null {
  const title = element.selectFirst('span.chapter-title')?.text();
  const link = element.selectFirst('a');
  if (!title || !link) return null;
  const number = /Глава\s(\d+)/i.exec(title)?.[1];
  return {
    url: relativeUrl(link.attr('href') ?? ''),
    name: link.text(),
    number: number ? Number.parseFloat(number) : undefined,
    uploadedAt: parseDate(element.selectFirst('span.chapter-date')?.text() ?? ''),
  };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => catalog(page, 'popular'),
    getLatest: (page) => catalog(page, '-last_chapter_at'),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) {
        if (query.trim().length < 3)
          throw new Error(
            'Запрос должен содержать не менее 3 символов. / The query must contain at least 3 characters',
          );
        return parseList(await load(`${BASE_URL}/search?q=${encodeURIComponent(query.trim())}&page=${page}`), true);
      }
      return catalog(page, 'likes', filters);
    },
    getFilters: (): Filter[] => [
      {
        type: 'sort',
        id: 'order',
        label: 'Сортировка',
        options: ORDERS.map(([value, label]) => ({ value, label })),
        default: { value: 'popular', ascending: false },
      },
      {
        type: 'group',
        id: 'genres',
        label: 'Жанры',
        filters: GENRES.map(([label, id]): Filter => ({ type: 'tristate', id: `genre.${id}`, label })),
      },
      {
        type: 'group',
        id: 'statuses',
        label: 'Статус',
        filters: STATUSES.map(([id, label]): Filter => ({ type: 'checkbox', id: `status.${id}`, label })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      const info = document.selectFirst('div.card:has(header)');
      if (!info) throw new Error('Не получилось найти информацию о манге');
      const status = selectIgnoreCase(info, 'span:contains(Статус:)')[0]?.text() ?? '';
      return {
        url: manga.url,
        title: info.selectFirst('.text-base span')?.text() || manga.title,
        genres: selectIgnoreCase(info, 'span:contains(Жанр:) a').map((a) => a.text()),
        description: info.selectFirst('.manga-description')?.text() || undefined,
        status: (status.includes('Завершена')
          ? 'completed'
          : status.includes('Выпускается')
            ? 'ongoing'
            : 'unknown') as MangaStatus,
        thumbnailUrl: info.selectFirst('img.w-full')?.absUrl('src') || manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const base = absoluteUrl(BASE_URL, manga.url);
      const tab = await load(`${base}?tab=chapters`);
      if (selectIgnoreCase(tab, '.text-md:contains(Главы удалены по требованию правообладателя)').length > 0)
        throw new Error('Лицензировано - Нет глав');
      const first = await load(`${base}/chaptersList`);
      const chapters = first.select('.chapter-item').flatMap((e) => chapterFromElement(e) ?? []);
      const lastPage = Math.max(
        1,
        ...first
          .select('li.page-item')
          .map((li) => Number.parseInt(li.text(), 10))
          .filter((n) => !Number.isNaN(n)),
      );
      for (let page = 2; page <= lastPage; page++) {
        const document = await load(`${base}/chaptersList?page=${page}`);
        chapters.push(...document.select('.chapter-item').flatMap((e) => chapterFromElement(e) ?? []));
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.get(absoluteUrl(BASE_URL, chapter.url), { headers });
      if (response.body.includes('text-error-500-400-token'))
        throw new Error('Лицензировано - Глава удалена по требованию правообладателя.');
      const document = html.load(response.body, { baseUrl: response.url });
      return document
        .select('img.page-image')
        .map((img, index) => ({ index, imageUrl: imgAttr(img, ['data-src', 'src']) }));
    },
    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?mangapoisk\.me(\/manga\/[^/?#]+)/i.exec(url.trim());
      return match ? { url: match[1]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
