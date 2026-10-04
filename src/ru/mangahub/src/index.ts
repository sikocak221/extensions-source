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
import { USER_AGENT, absoluteUrl, parseDate, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://mangahub.ru';
const headers = { 'User-Agent': USER_AGENT, Cookie: 'confirm_age=1' };

type Pair = [label: string, value: string];

/** Filter groups in the order the site wants them in the path (any other order is a 404). */
const GROUPS = [
  { id: 'type', prefix: 'type', label: 'Тип', box: 'type' },
  { id: 'format', prefix: 'formats', label: 'Формат выпуска', box: 'formats' },
  { id: 'genres', prefix: 'genres', label: 'Жанры', box: 'genres' },
  { id: 'status', prefix: 'status', label: 'Статус', box: 'status' },
  { id: 'translation', prefix: 'translation', label: 'Статус перевода', box: 'statusTranslation' },
  { id: 'age', prefix: 'age', label: 'Возрастное ограничение', box: 'ageRating' },
  { id: 'country', prefix: 'country', label: 'Страна', box: 'country' },
  { id: 'tags', prefix: 'tags', label: 'Теги', box: 'tags' },
] as const;
const RANGES = [
  { id: 'year', prefix: 'year', label: 'Год выпуска', rating: false },
  { id: 'items', prefix: 'items', label: 'Количество глав', rating: false },
  { id: 'rating', prefix: 'rating', label: 'Рейтинг', rating: true },
] as const;

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function groupSegment(filters: FilterState, group: (typeof GROUPS)[number]): string | undefined {
  // Without sorting the ids the search page answers 404.
  const ids = (state: string) =>
    Object.entries(filters)
      .filter(([id, value]) => id.startsWith(`${group.id}.`) && value === state)
      .map(([id]) => id.slice(group.id.length + 1))
      .sort();
  const included = ids('include');
  const excluded = ids('exclude');
  const path = [included.length ? included.join('-or-') : '', excluded.length ? `nor-${excluded.join('-nor-')}` : '']
    .filter(Boolean)
    .join('-');
  return path ? `${group.prefix}-is-${path}` : undefined;
}

function rangeSegment(filters: FilterState, range: (typeof RANGES)[number]): string | undefined {
  const read = (key: string) => {
    const value = filters[`${range.id}${key}`];
    const number = typeof value === 'string' ? Number.parseFloat(value) : Number.NaN;
    if (Number.isNaN(number)) return undefined;
    if (range.rating) return Math.min(Math.max(number, 0), 10).toFixed(1);
    return number > 0 ? String(Math.trunc(number)) : undefined;
  };
  const min = read('Min');
  const max = read('Max');
  if (min && max) return `${range.prefix}-from-${min}-to-${max}`;
  if (min) return `${range.prefix}-from-${min}`;
  if (max) return `${range.prefix}-to-${max}`;
  return undefined;
}

async function catalog(sortBy: string, page: number, query?: string, filters?: FilterState): Promise<MangaPage> {
  let url: string;
  if (query?.trim()) {
    url = `${BASE_URL}/search/title?query=${encodeURIComponent(query.trim())}`;
  } else {
    const segments: Record<string, string | undefined> = {};
    for (const group of GROUPS) segments[group.id] = filters ? groupSegment(filters, group) : undefined;
    for (const range of RANGES) segments[range.id] = filters ? rangeSegment(filters, range) : undefined;
    const sorted = typeof filters?.order === 'string' && filters.order ? filters.order : sortBy;
    // The site's order: type, format, genres, status, translation, age, country, tags, year, items, rating.
    const ordered = [
      'type',
      'format',
      'genres',
      'status',
      'translation',
      'age',
      'country',
      'tags',
      'year',
      'items',
      'rating',
    ]
      .map((id) => segments[id])
      .filter((s): s is string => !!s);
    url = `${BASE_URL}/explore/${[...ordered, `sort-is-${sorted}`].join('/')}`;
  }
  if (page > 1) url += `${url.includes('?') ? '&' : '?'}page=${page}`;
  const document = await load(url);
  const items = document.select('div.item-grid').flatMap((element): MangaSummary[] => {
    const link = element.selectFirst('a.fw-medium');
    if (!link) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title: link.text(),
        thumbnailUrl: element.selectFirst('img.item-grid-image')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('.pagination .page-item:last-child a') !== null };
}

function attrValues(document: HtmlElement, ...names: string[]): string | undefined {
  const values = names.flatMap((name) =>
    selectIgnoreCase(document, `.attr-name:contains(${name}) + .attr-value a`).map((a) => a.text().replace(/,$/, '')),
  );
  return [...new Set(values.filter(Boolean))].join(', ') || undefined;
}

function attrText(document: HtmlElement, name: string): string | undefined {
  return selectIgnoreCase(document, `.attr-name:contains(${name}) + .attr-value`)[0]?.text();
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => catalog('rating', page),
    getLatest: (page) => catalog('update', page),
    search: (query, page, filters) => catalog('rating', page, query, filters),
    async getFilters(): Promise<Filter[]> {
      let document: HtmlElement;
      try {
        document = await load(`${BASE_URL}/explore`);
      } catch (error) {
        log.warn('Cannot load filters', error);
        return [];
      }
      const filters: Filter[] = [];
      const sort = document.select('.select-menu-list .select-menu-item').flatMap((item): Pair[] => {
        const value = item.selectFirst('input')?.attr('value')?.trim();
        const label = item.text().trim();
        return value ? [[label, value]] : [];
      });
      if (sort.length)
        filters.push({
          type: 'select',
          id: 'order',
          label: 'Сортировать по',
          options: sort.map(([label, value]) => ({ label, value })),
          default: sort.some(([, v]) => v === 'rating') ? 'rating' : sort[0]![1],
        });
      for (const group of GROUPS) {
        const options = document.select(`#filter_${group.box} .filter-item`).flatMap((item): Pair[] => {
          const value = item.selectFirst('input')?.attr('value')?.trim();
          const label = item.selectFirst('label')?.text();
          return value && label ? [[label, value]] : [];
        });
        if (options.length)
          filters.push({
            type: 'group',
            id: group.id,
            label: group.label,
            filters: options.map(([label, value]): Filter => ({ type: 'tristate', id: `${group.id}.${value}`, label })),
          });
      }
      for (const range of RANGES)
        filters.push(
          { type: 'text', id: `${range.id}Min`, label: `${range.label}: от` },
          { type: 'text', id: `${range.id}Max`, label: `${range.label}: до` },
        );
      return filters;
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      const volumes = attrText(document, 'Томов') ?? '';
      let status: MangaStatus = 'unknown';
      if (volumes.includes('продолжается')) status = 'ongoing';
      else if (volumes.includes('приостановлен')) status = 'hiatus';
      else if (volumes.includes('завершен') || volumes.includes('выпуск прекращён'))
        status = attrText(document, 'Перевод')?.includes('Завершен') ? 'completed' : 'ongoing';
      return {
        url: manga.url,
        title: document.selectFirst('.detail-panel h1')?.text() || manga.title,
        author: attrValues(document, 'Автор', 'Сценарист'),
        artist: attrValues(document, 'Художник'),
        genres: document.select('.tags a').map((a) => a.text().replace(/^#/, '')),
        description: document.selectFirst('.markdown-style.text-expandable-content')?.text() || undefined,
        status,
        thumbnailUrl: document.selectFirst('img.cover-detail')?.absUrl('src') || manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const base = absoluteUrl(BASE_URL, manga.url);
      const translators = attrValues(await load(base), 'Переводчик');
      const document = await load(`${base}/chapters`);
      return document.select('.detail-items .detail-item').flatMap((element): Chapter[] => {
        const link = element.selectFirst('div.align-items-center > a');
        if (!link) return [];
        const name = link.text();
        const number = /Глава\s*([\d.]+)/.exec(name)?.[1];
        return [
          {
            url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
            name,
            number: number ? Number.parseFloat(number) || undefined : undefined,
            scanlator: translators,
            uploadedAt: parseDate(element.selectFirst('div.text-muted')?.text(), 'dd.MM.yyyy'),
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(absoluteUrl(BASE_URL, chapter.url));
      return document.select('img.reader-viewer-img').map((img, index) => {
        const url = img.attr('data-src') ?? '';
        return { index, imageUrl: url.startsWith('//') ? `https:${url}` : url };
      });
    },
    imageHeaders: () => ({ 'User-Agent': USER_AGENT }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?mangahub\.ru\/title\/([^/?#]+)/i.exec(url.trim());
      return match ? { url: `/title/${match[1]}`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
