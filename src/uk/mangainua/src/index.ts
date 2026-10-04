import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type HttpRequest,
  type MangaDetails,
  type MangaPage,
  type MangaStatus,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, ownText, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://manga.in.ua';
const SITE_LOGIN_HASH = 'site_login_hash';

const headers = { 'User-Agent': USER_AGENT };
const ajaxHeaders = { ...headers, 'X-Requested-With': 'XMLHttpRequest' };

const SORTS: [string, string][] = [
  ['За переглядами', 'news_read;desc'],
  ['За рейтингом', 'd.mrating;desc'],
  ['Спочатку нові', 'date;desc'],
  ['За коментарями', 'comm_num;desc'],
  ['За назвою', 'nameukr;asc'],
  ['Від новинок до старих', 'd.yer;desc'],
  ['Від старих до новинок', 'd.yer;asc'],
];

const CATEGORIES: [string, string][] = [
  ['Всі категорї', ''],
  ['МАНҐА', 'manga'],
  ['МАНХВА', 'manhwa'],
  ['МАНЬХВА', 'manhua'],
  ['ВАНШОТ', 'one-shot'],
  ['ДОДЖІНШІ', 'dojinshi'],
  ['МАЛЬОПИС', 'malopys'],
];

const YEARS: [string, string][] = [
  ['Всі роки', ''],
  ['2026', '2026,2026'],
  ['2025', '2025,2025'],
  ['2024', '2024,2024'],
  ['2023', '2023,2023'],
  ['2022', '2022,2022'],
  ['2021', '2021,2021'],
  ['2020', '2020,2020'],
  ['2019', '2019,2019'],
  ['2016 - 2026', '2016,2026'],
  ['2010 - 2016', '2010,2016'],
  ['2000 - 2010', '2000,2010'],
  ['1990 - 2000', '1990,2000'],
  ['1980 - 1990', '1980,1990'],
  ['До 80-х', '1921,1980'],
];

const SIZES: [string, string][] = [
  ['Будь-яка кількість', ''],
  ['Від 1 до 20 розділів', '1,20'],
  ['Від 20 до 50 розділів', '20,50'],
  ['Від 50 до 100 розділів', '50,100'],
  ['Більше 100 розділів', '100,1000'],
];

const TAGS: [string, string][] = [
  ['Божевілля', '53'],
  ['Бойовик', '12'],
  ['Бойові мистецтва', '13'],
  ['Буденність', '26'],
  ['Вампіри', '14'],
  ['Гарем', '15'],
  ['Для дітей', '3'],
  ['Детектив', '16'],
  ['Демони', '52'],
  ['Джьосей', '10'],
  ['Доджінші', '18'],
  ['Драма', '19'],
  ['Еччі', '39'],
  ['Жахи', '35'],
  ['Зміна статі', '44'],
  ['Ігри', '51'],
  ['Ісекай', '63'],
  ['Історія', '20'],
  ['Іяшікей', '62'],
  ['Йонкома', '42'],
  ['Космос', '50'],
  ['Комедія', '22'],
  ['Махо-шьоджьо', '11'],
  ['Машини', '49'],
  ['Меха', '23'],
  ['Містика', '24'],
  ['Музика', '48'],
  ['Надприродне', '31'],
  ['Наукова фантастика', '25'],
  ['Пародія', '47'],
  ['Пригоди', '28'],
  ['Психологія', '29'],
  ['Поліція', '46'],
  ['Постапокаліптика', '27'],
  ['Романтика', '30'],
  ['Самураї', '45'],
  ['Сентай', '6'],
  ['Сейнен', '9'],
  ['Спорт', '32'],
  ['Суперсила', '43'],
  ['Трагедія', '33'],
  ['Трилер', '34'],
  ['Фантастика', '36'],
  ['Фентезі', '37'],
  ['Шьоджьо', '4'],
  ['Шьоджьо-ай', '60'],
  ['Шьонен', '5'],
  ['Шьонен-ай', '61'],
  ['Школа', '38'],
  ['Юрі', '40'],
  ['Яой', '41'],
];

const AGES: [string, string][] = [
  ['Будь-який вік', ''],
  ['Від 12 років', '12'],
  ['Від 16 років', '16'],
  ['Від 18 років', '18'],
];

const STATUSES: [string, string][] = [
  ['Будь-який статус', ''],
  ['Триває', 'Триває'],
  ['Закінчено', 'Закінчений'],
  ['Невідомо', 'Невідомо'],
  ['Покинуто', 'Покинуто'],
  ['Заморожено', 'Заморожено'],
];

const TAGS_PREF = 'site_hidden_tags';
const TAGS_SEARCH_PREF = 'site_hidden_tags_search';

const PREFERENCES: Preference[] = [
  {
    type: 'multiselect',
    key: TAGS_PREF,
    label: 'Приховані категорії',
    description: "Ці категорії завжди будуть приховані в 'Популярне', 'Новинки' та 'Фільтр'.",
    options: TAGS.map(([label, value]) => ({ label, value })),
    default: [],
  },
  {
    type: 'switch',
    key: TAGS_SEARCH_PREF,
    label: 'Приховувати обрані категорії при пошуку за назвою',
    default: false,
  },
];

const ignoreTags = () => prefs.get<string[]>(TAGS_PREF) ?? [];

const STATUS: Record<string, MangaStatus> = {
  Триває: 'ongoing',
  Заморожено: 'hiatus',
  Покинуто: 'cancelled',
  Закінчений: 'completed',
};

/** A path segment as OkHttp writes it: ';', ',', '=' and '!' stay as they are. */
const segment = (value: string) =>
  encodeURIComponent(value).replace(/%3B/gi, ';').replace(/%2C/gi, ',').replace(/%3D/gi, '=').replace(/%21/g, '!');

async function load(url: string, init: Omit<HttpRequest, 'url'> = { headers }): Promise<HtmlElement> {
  const response = await http.request<string>({ ...init, url });
  return html.load(response.body, { baseUrl: response.url });
}

function imgAttr(element: HtmlElement | null): string | undefined {
  if (!element) return undefined;
  return (element.attr('data-src') !== undefined ? element.absUrl('data-src') : element.absUrl('src')) || undefined;
}

function parseList(document: HtmlElement, ignoredTags: Set<string>): MangaPage {
  const hideByTag = prefs.get<boolean>(TAGS_SEARCH_PREF) ?? false;
  const items = document.select('div#site-content article.item').flatMap((element): MangaSummary[] => {
    // No image: probably a deleted manga that the site still lists in search results.
    if (!element.selectFirst('img')) return [];
    if (
      hideByTag &&
      ignoredTags.size > 0 &&
      element.select('div.card__category a').some((a) => ignoredTags.has(a.text()))
    ) {
      return [];
    }
    const link = element.selectFirst('h3.card__title a');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: link.text(),
        thumbnailUrl: imgAttr(element.selectFirst('img')),
      },
    ];
  });
  return { items, hasNextPage: document.select('a').some((a) => a.text().includes('Наступна')) };
}

async function listing(page: number, sortBy: string, filters?: FilterState): Promise<MangaPage> {
  const segments: string[] = [];
  if (filters) {
    const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');
    const tri = (state: 'include' | 'exclude') =>
      Object.entries(filters)
        .filter(([id, v]) => id.startsWith('tag.') && v === state)
        .map(([id]) => id.slice('tag.'.length));
    if (text('type')) segments.push(`b.type=${text('type')}`);
    if (text('status')) segments.push(`b.tra=${text('status')}`);
    const included = tri('include');
    const excluded = [...new Set([...tri('exclude'), ...ignoreTags()])].filter((t) => !included.includes(t));
    if (included.length) segments.push(`cat=${included.join(',')}`);
    if (excluded.length) segments.push(`!cat=${excluded.join(',')}`);
    segments.push(`sort=${text('sort') || sortBy}`);
    if (text('size')) segments.push(`c.lastchappr=${text('size')}`);
    if (text('age')) segments.push(`b.vik=${text('age')}`);
    if (text('year')) segments.push(`c.yer=${text('year')}`);
  } else {
    if (ignoreTags().length) segments.push(`!cat=${ignoreTags().join(',')}`);
    segments.push(`sort=${sortBy}`);
  }
  const path = segments.map(segment).join('/');
  const url = `${BASE_URL}/filter/${path}/${page > 1 ? `page/${page}/` : ''}`;
  return parseList(await load(url), new Set());
}

function infoElement(document: HtmlElement, label: string): HtmlElement | null {
  const header = document
    .select('div.item__full-sideba--header')
    .find((h) => h.select('div').some((d) => ownText(d).includes(label)));
  return header?.selectFirst('span.item__full-sidebar--description') ?? null;
}

function userHash(document: HtmlElement): string {
  const script = document
    .select('script')
    .map((s) => s.html())
    .find((text) => text.includes(`${SITE_LOGIN_HASH} = `));
  const hash = script
    ?.substring(script.indexOf(`${SITE_LOGIN_HASH} = '`) + `${SITE_LOGIN_HASH} = '`.length)
    .split("'")[0];
  if (!hash) throw new Error("Couldn't find user hash");
  return hash;
}

function userHashQuery(document: HtmlElement, endpoint: string): string {
  const script = document
    .select('script')
    .map((s) => s.html())
    .find((text) => text.includes(endpoint));
  if (!script) throw new Error("Couldn't find user hash query script!");
  const query = new RegExp(`(\\w+)\\s*:\\s*${SITE_LOGIN_HASH}`).exec(script)?.[1];
  if (!query) throw new Error("Couldn't find user hash query!");
  return query;
}

async function chapterList(document: HtmlElement): Promise<Chapter[]> {
  const endpoint = 'engine/ajax/controller.php?mod=load_chapters';
  const holder = document.selectFirst('div#linkstocomics');
  if (!holder) throw new Error('Chapter list not found');
  const response = await http.post(
    `${BASE_URL}/${endpoint}`,
    {
      form: {
        action: 'show',
        news_id: holder.attr('data-news_id') ?? '',
        news_category: holder.attr('data-news_category') ?? '',
        this_link: holder.attr('data-this_link') ?? '',
        [userHashQuery(document, endpoint)]: userHash(document),
      },
    },
    { headers: ajaxHeaders },
  );
  const items = html.load(response.body, { baseUrl: BASE_URL }).select('div.ltcitems').reverse();
  const chapters: Chapter[] = [];
  for (const element of items) {
    const link = element.selectFirst('a');
    if (!link) continue;
    const chapterName = ownText(link).trim();
    const chapterNumber = element.attr('manga-chappter') ?? '';
    const volumeNumber = element.attr('manga-tom') ?? '';
    // Neither a chapter nor a volume number: not a chapter.
    if (!chapterNumber && !volumeNumber) continue;
    const translate = element.attr('translate');
    const scanlator = translate?.trim() ? translate : link.text().split('від:').slice(1).join('від:').trim();
    chapters.push({
      url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
      name: chapterName.includes('Альтернативний') ? `Том ${volumeNumber}. Розділ ${chapterNumber}` : chapterName,
      number: Number.parseFloat(chapterNumber) || 0,
      scanlator: scanlator || undefined,
      uploadedAt: parseDate(ownText(element.selectFirst('*')), 'dd.MM.yyyy'),
    });
  }
  return chapters;
}

const selectFilter = (id: string, label: string, entries: [string, string][], def = ''): Filter => ({
  type: 'select',
  id,
  label,
  options: entries.map(([label, value]) => ({ label, value })),
  default: def,
});

export default defineExtension({
  preferences: () => PREFERENCES,
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => listing(page, 'news_read;desc'),
    getLatest: (page) => listing(page, 'date;desc'),
    async search(query, page, filters): Promise<MangaPage> {
      if (query) {
        if (query.length < 3) {
          throw new Error('Запит має містити щонайменше 3 символи / The query must contain at least 3 characters');
        }
        const document = await load(`${BASE_URL}/index.php?do=search`, {
          method: 'POST',
          headers,
          body: {
            form: {
              do: 'search',
              subaction: 'search',
              full_search: '1',
              story: query,
              search_start: String(page),
              result_from: String(1 + 12 * (page - 1)),
            },
          },
        });
        const ignored = new Set(TAGS.filter(([, id]) => ignoreTags().includes(id)).map(([name]) => name));
        return parseList(document, ignored);
      }
      return listing(page, 'news_read;desc', filters);
    },
    getFilters: (): Filter[] => [
      { type: 'header', label: 'Фільтри не застосовуються під час пошуку за назвою' },
      selectFilter('type', 'Категорії', CATEGORIES),
      selectFilter('status', 'Статус перекладу', STATUSES),
      {
        type: 'group',
        id: 'tag',
        label: 'Жанри',
        filters: TAGS.map(([label, value]) => ({ type: 'tristate', id: `tag.${value}`, label })),
      },
      selectFilter('sort', 'Сортувати', SORTS, 'news_read;desc'),
      selectFilter('size', 'Кількість розділів', SIZES),
      selectFilter('age', 'Вік', AGES),
      selectFilter('year', 'Роки', YEARS),
      { type: 'separator' },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(`${BASE_URL}${manga.url}`);
      const type = infoElement(document, 'Тип:')?.text();
      return {
        url: manga.url,
        title: ownText(document.selectFirst('span.UAname')) || manga.title,
        description: document.selectFirst('div.item__full-description p')?.text() || undefined,
        thumbnailUrl: imgAttr(document.selectFirst('div.item__full-sidebar--poster img')) ?? manga.thumbnailUrl,
        status: STATUS[infoElement(document, 'Статус перекладу:')?.text() ?? ''] ?? 'unknown',
        genres: [
          ...(type ? [type] : []),
          ...(infoElement(document, 'Жанри:')
            ?.select('a')
            .map((a) => a.text()) ?? []),
        ],
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      return chapterList(await load(`${BASE_URL}${manga.url}`));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(`${BASE_URL}${chapter.url}`);
      const endpoint = 'engine/ajax/controller.php?mod=load_chapters_image';
      const newsId = document.selectFirst('div#comics')?.attr('data-news_id') ?? '';
      const url = `${BASE_URL}/${endpoint}&news_id=${newsId}&action=show&${userHashQuery(document, endpoint)}=${userHash(document)}`;
      const images = await load(url, { headers: ajaxHeaders });
      return images.select('li img').map((img, index) => ({ index, imageUrl: img.attr('data-src') }));
    },
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
    resolveUrl(url): MangaSummary | null {
      const match = /^https?:\/\/manga\.in\.ua(\/mangas\/[^?#]+)/i.exec(url);
      return match ? { url: match[1]!, title: '' } : null;
    },
  }),
});
