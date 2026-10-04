import {
  type Chapter,
  type Filter,
  type FilterOption,
  type FilterState,
  type HtmlElement,
  type MangaPage,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

const HIDE_LOCKED_PREFERENCE: Preference = {
  type: 'switch',
  key: 'hide_locked_chapters',
  label: 'Приховувати преміум глави',
  description: 'Може викликати помилки при оновленні. Будуть відмічені іконкою: 🔒',
  default: true,
};

const MIN_YEAR = 2018;
const LOCK = '🔒 ';

interface ChapterData {
  chapterDates?: Record<string, string> | unknown[];
  chapterAccess?: Record<string, { locked?: boolean }> | unknown[];
}

interface ReaderConfig {
  endpoint: string;
  postId: number;
  chapterSlug: string;
  token: string;
  restNonce: string;
}

interface FilterData {
  genres: FilterOption[];
  translators: FilterOption[];
  type: FilterOption[];
  status: FilterOption[];
}

const AGE_OPTIONS: FilterOption[] = [
  { label: 'Усі', value: '' },
  { label: 'Без 18+', value: 'sfw' },
  { label: '18+', value: 'adult' },
];

/** JSON object assigned to `marker` in an inline script: everything up to the last ';'. */
function scriptJson<T>(document: HtmlElement, marker: string): T {
  const script = document
    .select('script')
    .map((s) => s.html())
    .find((text) => text.includes(marker));
  if (!script) throw new Error('Data not found');
  const value = script.substring(script.indexOf(marker) + marker.length);
  return JSON.parse(value.substring(0, value.lastIndexOf(';')).trim()) as T;
}

const lastSegment = (url: string) => url.replace(/\/+$/, '').split('/').pop() ?? '';

class Mangarama extends Madara {
  readonly name = 'Mangarama';
  readonly baseUrl = 'https://mangarama.com.ua';

  override chapterMode = 'MangaAjax' as const;
  override chapterDatePattern = 'dd.MM.yyyy';
  override altNameSelector = '.post-content_item:contains(Альтернативна) .summary-content';
  override mangaDetailsSelectorStatus = 'div.summary-content, div.summary-heading:contains(Статус) + div';

  override orderByFilterOptions: FilterOption[] = [
    { label: 'Популярні', value: 'popular' },
    { label: 'Нещодавно оновлені', value: 'updated' },
    { label: 'Нові', value: 'new' },
    { label: 'За назвою А-Я', value: 'title_asc' },
    { label: 'За назвою Я-А', value: 'title_desc' },
    { label: 'За роком: новіші', value: 'year_desc' },
    { label: 'За роком: старіші', value: 'year_asc' },
  ];

  // Popular / latest / search
  override getPopular(page: number): Promise<MangaPage> {
    return this.catalog('popular', page);
  }

  override getLatest(page: number): Promise<MangaPage> {
    return this.catalog('updated', page);
  }

  override search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    return this.catalog('popular', page, query, filters);
  }

  async catalog(sortBy: string, _page: number, query?: string, filters?: FilterState): Promise<MangaPage> {
    const params: [string, string][] = [];
    const text = (id: string) => (typeof filters?.[id] === 'string' ? (filters[id] as string).trim() : '');
    const checked = (prefix: string) =>
      Object.entries(filters ?? {})
        .filter(([id, value]) => id.startsWith(prefix) && value === true)
        .map(([id]) => id.slice(prefix.length));
    if (filters) {
      if (text('order')) params.push(['mcf_sort', text('order')]);
      if (text('translator')) params.push(['translator', text('translator')]);
      if (text('age')) params.push(['mcf_age', text('age')]);
      for (const id of checked('type.')) params.push(['mcf_type[]', id]);
      for (const id of checked('status.')) params.push(['mcf_status[]', id]);
      for (const [id, value] of Object.entries(filters)) {
        if (!id.startsWith('genre.')) continue;
        if (value === 'include') params.push(['mcf_genre[]', id.slice('genre.'.length)]);
        else if (value === 'exclude') params.push(['mcf_genre_exclude[]', id.slice('genre.'.length)]);
      }
      const year = (id: string) => {
        const value = Number.parseInt(text(id), 10);
        return Number.isNaN(value)
          ? undefined
          : String(Math.min(Math.max(value, MIN_YEAR), new Date().getUTCFullYear()));
      };
      if (year('year_from')) params.push(['mcf_year_from', year('year_from')!]);
      if (year('year_to')) params.push(['mcf_year_to', year('year_to')!]);
    } else {
      params.push(['mcf_sort', sortBy]);
    }
    if (query?.trim()) params.push(['mcf_search', query.trim()]);
    const queryString = params
      .map(([k, v]) => `${encodeURIComponent(k).replace(/%5B/g, '[').replace(/%5D/g, ']')}=${encodeURIComponent(v)}`)
      .join('&');
    const document = await this.fetchDocument(
      `${this.baseUrl}/${this.mangaSubString}/${queryString ? `?${queryString}` : ''}`,
    );
    return { items: this.parseArchive(document), hasNextPage: false };
  }

  // Filters
  async fetchFilterData(): Promise<FilterData> {
    const document = await this.fetchDocument(`${this.baseUrl}/${this.mangaSubString}/`);
    const checks = (section: string) =>
      document.select(`.mcf-section:contains(${section}) .mcf-check`).flatMap((el): FilterOption[] => {
        const value = el.selectFirst('input')?.attr('value');
        const label = el.selectFirst('span')?.text();
        return value === undefined || label === undefined ? [] : [{ value, label }];
      });
    return {
      genres: document.select('.mcf-genre-scroll .mcf-genre-item').flatMap((el): FilterOption[] => {
        const value = el.selectFirst('input')?.attr('value');
        const label = el.selectFirst('span')?.text();
        if (value === undefined || label === undefined) return [];
        const count = document.selectFirst(`a:contains(${label}) .count`)?.text() ?? '';
        return [{ value, label: `${label} ${count}`.trim() }];
      }),
      translators: document.select('.mcf-team-select option').flatMap((el): FilterOption[] => {
        const value = el.attr('value') ?? '';
        const label = el.text();
        return !value.trim() && !label.trim() ? [] : [{ value, label }];
      }),
      type: checks('Тип'),
      status: checks('Статус'),
    };
  }

  override async getFilters(): Promise<Filter[]> {
    const data = await this.fetchFilterData().catch((): FilterData | null => null);
    const filters: Filter[] = [
      { type: 'select', id: 'order', label: 'Сортувати за', options: this.orderByFilterOptions, default: 'popular' },
    ];
    if (data?.genres.length) {
      filters.push({
        type: 'group',
        id: 'genre',
        label: 'Жанри',
        filters: data.genres.map((g) => ({ type: 'tristate', id: `genre.${g.value}`, label: g.label })),
      });
    }
    const group = (id: string, label: string, options: FilterOption[]): Filter => ({
      type: 'group',
      id,
      label,
      filters: options.map((o) => ({ type: 'checkbox', id: `${id}.${o.value}`, label: o.label })),
    });
    if (data?.type.length) filters.push(group('type', 'Тип', data.type));
    if (data?.status.length) filters.push(group('status', 'Статус', data.status));
    if (data?.translators.length) {
      filters.push({ type: 'select', id: 'translator', label: 'Команда перекладу', options: data.translators });
    }
    filters.push(
      { type: 'select', id: 'age', label: 'Вікове обмеження', options: AGE_OPTIONS, default: '' },
      {
        type: 'group',
        id: 'year',
        label: 'Рік випуску',
        filters: [
          { type: 'text', id: 'year_from', label: `Від ${MIN_YEAR}` },
          { type: 'text', id: 'year_to', label: `До ${new Date().getUTCFullYear()}` },
        ],
      },
    );
    return filters;
  }

  // Chapters
  override async fetchChapters(mangaPath: string, mangaPage: HtmlElement | null): Promise<Chapter[]> {
    const path = mangaPath.replace(/\/+$/, '');
    const response = await http.post(
      `${this.baseUrl}${path}/ajax/chapters/`,
      { form: { 'manga-core': lastSegment(path), manga_ajax: '1', maction: 'get_chapters' } },
      { headers: this.xhrHeaders() },
    );
    const main = mangaPage ?? (await this.fetchDocument(`${this.baseUrl}${mangaPath}`));
    const data = scriptJson<ChapterData>(main, 'ManhvaChapterListUI = ');
    const hideLocked = prefs.get<boolean>(HIDE_LOCKED_PREFERENCE.key) ?? true;

    const list = html.load(response.body, { baseUrl: this.baseUrl });
    const chapters: Chapter[] = [];
    for (const element of list.select(this.chapterListSelector())) {
      const chapter = this.chapterFromElement(element, mangaPath);
      if (!chapter) continue;
      const slug = lastSegment(chapter.url);
      const date = Array.isArray(data.chapterDates) ? undefined : data.chapterDates?.[slug];
      if (date) chapter.uploadedAt = this.parseChapterDate(date);
      const access = Array.isArray(data.chapterAccess) ? undefined : data.chapterAccess?.[slug];
      if (access?.locked) {
        if (hideLocked) continue;
        chapter.name = `${LOCK}${chapter.name}`;
      }
      chapters.push(chapter);
    }
    return chapters;
  }

  // Pages
  override async getPages(chapter: Chapter): Promise<Page[]> {
    if (chapter.name.startsWith(LOCK)) throw new Error('Цей розділ доступний лише з Преміум.');
    const chapterUrl = this.absolute(chapter.url);
    const document = await this.fetchDocument(chapterUrl);
    const config = scriptJson<ReaderConfig>(document, 'window.MANHVA_READER_CONFIG = ');
    const query = `post=${config.postId}&chapter=${encodeURIComponent(config.chapterSlug)}&token=${encodeURIComponent(config.token)}`;
    const response = await http.get(`${config.endpoint}${config.endpoint.includes('?') ? '&' : '?'}${query}`, {
      headers: { ...this.headers(), 'X-WP-Nonce': config.restNonce },
    });
    const { pages } = JSON.parse(response.body) as { pages: string[] };
    return pages.map((imageUrl, index) => ({ index, url: chapterUrl, imageUrl }));
  }

  override imageHeaders(): Record<string, string> {
    return {
      ...super.imageHeaders(),
      'Sec-Fetch-Dest': 'image',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'same-site',
      'Sec-GPC': '1',
    };
  }
}

export default defineExtension({
  preferences: () => [HIDE_LOCKED_PREFERENCE],
  createSource: () => new Mangarama().toSource(),
});
