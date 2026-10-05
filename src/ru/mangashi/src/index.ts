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

const BASE_URL = 'https://manga-shi.org';
const MIN_PAGE_SIZE = 20;
const headers = { 'User-Agent': USER_AGENT };

const CHAPTER_URL_REGEX = /\/glava[-_]/;
const CHAPTER_NUMBER_REGEX = /\/glava[-_]([\d,]+)/;
const ABSOLUTE_DATE_REGEX = /^\d{2}\.\d{2}\.\d{4}$/;
const RELATIVE_DATE_REGEX = /\d+\s*(сек|мин|час|дн|день|дня|недел|месяц|год|лет)/;

type Pair = [label: string, value: string];
const SORTS: Pair[] = [
  ['По дате добавления', 'added'],
  ['По обновлению глав', 'updated'],
  ['По рейтингу', 'rating'],
  ['По популярности', 'popular'],
  ['По количеству глав', 'chapters'],
  ['По году выпуска', 'year'],
];
const STATUSES: Pair[] = [
  ['Все', ''],
  ['Онгоинг', 'ONGOING'],
  ['Завершён', 'COMPLETED'],
  ['Хиатус', 'HIATUS'],
];
const TYPES: Pair[] = [
  ['Все', ''],
  ['Манга', 'MANGA'],
  ['Манхва', 'MANHWA'],
  ['Маньхуа', 'MANHUA'],
  ['Западный комикс', 'WESTERN'],
];
const YEARS: Pair[] = [
  ['Все годы', ''],
  ...[
    2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010, 2005, 2002,
    1998, 1997, 1989, 1977,
  ].map((y): Pair => [String(y), String(y)]),
];
const AGES: Pair[] = [
  ['Все', ''],
  ['Без 18+', 'sfw'],
  ['Только 18+', 'adult'],
];

const select = (id: string, label: string, options: Pair[], fallback = ''): Filter => ({
  type: 'select',
  id,
  label,
  options: options.map(([text, value]) => ({ label: text, value })),
  default: fallback,
});

const enc = (value: string) => encodeURIComponent(value);

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function cardToManga(element: HtmlElement): MangaSummary {
  const href = element.absUrl('href') || element.attr('href') || '';
  const title =
    element.selectFirst('h3, h4, .title')?.text() ||
    element
      .text()
      .split('\n')
      .find((line) => line.trim()) ||
    '';
  return {
    url: relativeUrl(href),
    title,
    thumbnailUrl: imgAttr(element.selectFirst('img'), ['data-src', 'src']) || undefined,
  };
}

async function catalog(page: number, sortBy = '', query = '', filters?: FilterState): Promise<MangaPage> {
  const params: [string, string][] = [];
  const value = (id: string) => (typeof filters?.[id] === 'string' ? (filters[id] as string) : '');
  if (filters) {
    params.push(['sort', value('sort') || 'popular'], ['status', value('status')], ['type', value('type')]);
    params.push(['age_rating', value('age')], ['year', value('year')]);
    for (const [id, state] of Object.entries(filters)) {
      if (!id.startsWith('genre.')) continue;
      if (state === 'include') params.push(['tag', id.slice(6)]);
      else if (state === 'exclude') params.push(['exclude_tag', id.slice(6)]);
    }
  } else {
    params.push(['sort', sortBy], ['status', ''], ['type', ''], ['age_rating', ''], ['year', '']);
  }
  params.push(['chapters_min', ''], ['chapters_max', ''], ['q', query.trim()], ['page', String(page)]);
  const document = await load(`${BASE_URL}/catalog/?${params.map(([k, v]) => `${k}=${enc(v)}`).join('&')}`);
  const grid = document.selectFirst('#manga-grid');
  if (!grid) return { items: [], hasNextPage: false };
  const seen = new Set<string>();
  const items = grid
    .select('#manga-grid > a[href*="/manga/"]')
    .map(cardToManga)
    .filter((m) => m.url && !seen.has(m.url) && seen.add(m.url));
  return { items, hasNextPage: items.length >= MIN_PAGE_SIZE };
}

function parseStatus(raw?: string): MangaStatus {
  const text = raw?.toLowerCase() ?? '';
  if (/онгоинг|выпускается|продолжается/.test(text)) return 'ongoing';
  if (/завершен|завершён|завершена/.test(text)) return 'completed';
  if (/заморож|приостановл|хиатус/.test(text)) return 'hiatus';
  if (text.includes('заброш')) return 'cancelled';
  return 'unknown';
}

function parseChapterDate(text?: string): number | undefined {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  if (ABSOLUTE_DATE_REGEX.test(trimmed)) {
    const [day, month, year] = trimmed.split('.').map(Number);
    return Date.UTC(year!, month! - 1, day!);
  }
  const lower = trimmed.toLowerCase();
  const amount = Number.parseInt(/(\d+)/.exec(lower)?.[1] ?? '', 10);
  if (Number.isNaN(amount)) return undefined;
  const units: [string, number][] = [
    ['сек', 1000],
    ['мин', 60_000],
    ['час', 3_600_000],
    ['дн', 86_400_000],
    ['день', 86_400_000],
    ['дня', 86_400_000],
    ['недел', 7 * 86_400_000],
    ['месяц', 30 * 86_400_000],
    ['год', 365 * 86_400_000],
    ['лет', 365 * 86_400_000],
  ];
  const unit = units.find(([key]) => lower.includes(key));
  return unit ? Date.now() - amount * unit[1] : undefined;
}

function parseChapter(link: HtmlElement): Chapter | null {
  const href = link.attr('href') ?? '';
  if (!CHAPTER_URL_REGEX.test(href) || !link.selectFirst('span.chapter-title')) return null;
  const dateText = link
    .select('span span')
    .map((s) => s.text())
    .reverse()
    .find((t) => ABSOLUTE_DATE_REGEX.test(t.trim()) || RELATIVE_DATE_REGEX.test(t));
  const number = CHAPTER_NUMBER_REGEX.exec(href)?.[1]?.replace(',', '.');
  return {
    url: relativeUrl(href.startsWith('/') ? `${BASE_URL}${href}` : (link.absUrl('href') ?? href)),
    name: link
      .select('span.chapter-title > span')
      .map((s) => s.text())
      .join(' ')
      .trim(),
    number: number ? Number.parseFloat(number) || undefined : undefined,
    uploadedAt: parseChapterDate(dateText),
  };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => catalog(page, 'popular'),
    getLatest: (page) => catalog(page, 'updated'),
    search: (query, page, filters) => catalog(page, '', query, filters),
    async getFilters(): Promise<Filter[]> {
      const filters: Filter[] = [select('sort', 'Сортировка', SORTS, 'popular')];
      try {
        const document = await load(`${BASE_URL}/catalog/`);
        const genres = (document.selectFirst('.genre-flyout')?.select('.group') ?? []).flatMap((g): Pair[] => {
          const label = g.selectFirst('span')?.text();
          const value = g.selectFirst('input')?.attr('value');
          return label && value ? [[label, value]] : [];
        });
        if (genres.length)
          filters.push({
            type: 'group',
            id: 'genres',
            label: 'Жанры',
            filters: genres.map(([label, value]): Filter => ({ type: 'tristate', id: `genre.${value}`, label })),
          });
      } catch (error) {
        log.warn('Cannot load genres', error);
      }
      filters.push(
        select('status', 'Статус', STATUSES),
        select('type', 'Тип', TYPES),
        select('age', 'Возрастной рейтинг', AGES),
        select('year', 'Год выпуска', YEARS),
      );
      return filters;
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      const badges = document.select('span.tracking-widest').map((s) => s.text().trim());
      const statusText = badges.find((t) => /онгоинг|выпускается|заверш|заморож|приостановл|заброш|хиатус/i.test(t));
      const typeText = badges.find((t) => /манга|манхва|маньхуа|комикс/i.test(t));
      const genres = [
        ...new Set(
          [
            ...(typeText ? [typeText] : []),
            ...document.select('a[href*=manga-genre]').map((a) => a.text()),
            ...document.select('a[href*="?tag="]').map((a) => a.text()),
          ]
            .filter(Boolean)
            .map((g) => g.replace(/^#/, '').toLowerCase()),
        ),
      ];
      const image = document.selectFirst('meta[property=og:image]')?.attr('content');
      const description = document
        .select('div.leading-relaxed')
        .find((d) => (d.attr('x-ref') ?? '').includes('descDesktop'));
      return {
        url: manga.url,
        title: document.selectFirst('h1')?.text() || manga.title,
        author: document.selectFirst('a[href*="?author="]')?.text() || undefined,
        genres,
        status: parseStatus(statusText),
        description: description?.text().trim() || undefined,
        thumbnailUrl: image ? absoluteUrl(BASE_URL, image) : manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      const chapters = document.select('#chapters-list > a[href*="/glava"]').flatMap((a) => parseChapter(a) ?? []);
      const next = document.selectFirst('#chapters-load-more a')?.attr('hx-get');
      if (!next) return chapters;
      const base = `${BASE_URL}${next.split('?')[0]}?`;
      let query: string | undefined = next.split('?').slice(1).join('?');
      while (query) {
        const fragment = await load(`${base}${query}`);
        chapters.push(...fragment.select('a[href*="/glava"]').flatMap((a) => parseChapter(a) ?? []));
        const more = selectIgnoreCase(fragment, 'nav.flex a:last-child:contains(Дальше)')[0]?.attr('href');
        query = more ? more.split('?').slice(1).join('?') : undefined;
      }
      return chapters;
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(absoluteUrl(BASE_URL, chapter.url));
      return document
        .select('img.reader-image')
        .map((img, index) => ({ index, imageUrl: imgAttr(img, ['data-src', 'src']) }));
    },
    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?manga-shi\.org\/manga\/([^/?#]+)/i.exec(url.trim());
      return match ? { url: `/manga/${match[1]}/`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
