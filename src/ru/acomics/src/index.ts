import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://acomics.ru';
const headers = { 'User-Agent': USER_AGENT, Cookie: 'ageRestrict=18' };

const SECTIONS = [
  ['sandbox', 'Песочница'],
  ['comics', 'Каталог'],
  ['featured', 'Рекомендуемые'],
] as const;

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

async function catalog(sortBy: string, page: number, query?: string, filters?: FilterState): Promise<MangaPage> {
  const params: [string, string][] = [];
  let path: string;
  if (query?.trim()) {
    if (query.trim().length < 3)
      throw new Error('Запрос должен содержать не менее 3-х символов / The query must contain at least 3 characters');
    path = 'search';
    params.push(['keyword', query.trim()]);
  } else {
    path = typeof filters?.section === 'string' && filters.section ? filters.section : 'comics';
    if (filters) {
      const checked = (prefix: string) =>
        Object.entries(filters)
          .filter(([id, value]) => id.startsWith(`${prefix}.`) && value === true)
          .map(([id]) => id.slice(prefix.length + 1));
      for (const value of checked('category')) params.push(['categories[]', value]);
      // Without any rating ticked the site would return nothing: default is every rating but NC-17.
      for (const value of checked('rating')) params.push(['ratings[]', value]);
      for (const [id, param] of [
        ['type', 'type'],
        ['updatable', 'updatable'],
        ['subscribe', 'subscribe'],
        ['sort', 'sort'],
      ] as const) {
        const value = filters[id];
        if (typeof value === 'string' && value) params.push([param, value]);
      }
      const min = Number.parseInt(typeof filters.minPages === 'string' ? filters.minPages : '', 10);
      params.push(['issue_count', String(Number.isNaN(min) ? 2 : Math.min(Math.max(min, 0), 9999))]);
    } else {
      params.push(['sort', sortBy]);
      for (let rating = 1; rating <= 5; rating++) params.push(['ratings[]', String(rating)]);
      params.push(['type', '0'], ['updatable', '0'], ['subscribe', '0'], ['issue_count', '2']);
    }
  }
  if (page > 1) params.push(['skip', String((page - 1) * 10)]);
  const query_ = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const document = await load(`${BASE_URL}/${path}${query_ ? `?${query_}` : ''}`);
  const items = document.select('section.serial-card').flatMap((card): MangaSummary[] => {
    const link = card.selectFirst('h2 > a');
    if (!link) return [];
    return [
      {
        url: `${relativeUrl(link.attr('href') ?? '')}/about`,
        title: link.text(),
        thumbnailUrl: card.selectFirst('a > img')?.absUrl('data-real-src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('a.infinite-scroll') !== null };
}

function optionsOf(document: HtmlElement, cls: string): [label: string, value: string][] {
  return document.select(`.${cls} label`).flatMap((label): [string, string][] => {
    const value = label.selectFirst('input')?.attr('value')?.trim();
    return value === undefined ? [] : [[label.text(), value]];
  });
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => catalog('subscr_count', page),
    getLatest: (page) => catalog('last_update', page),
    search: (query, page, filters) => catalog('subscr_count', page, query, filters),
    async getFilters(): Promise<Filter[]> {
      const filters: Filter[] = [
        {
          type: 'select',
          id: 'section',
          label: 'Разделы поиска',
          options: SECTIONS.map(([value, label]) => ({ value, label })),
          default: 'comics',
        },
      ];
      let document: HtmlElement;
      try {
        document = await load(`${BASE_URL}/comics`);
      } catch (error) {
        log.warn('Cannot load filters', error);
        return filters;
      }
      const select = (id: string, label: string, options: [string, string][], fallback: string) => {
        if (options.length)
          filters.push({
            type: 'select',
            id,
            label,
            options: options.map(([text, value]) => ({ value, label: text })),
            default: options.some(([, value]) => value === fallback) ? fallback : options[0]![1],
          });
      };
      const checks = (id: string, label: string, options: [string, string][], on: (label: string) => boolean) => {
        if (options.length)
          filters.push({
            type: 'group',
            id,
            label,
            filters: options.map(([text, value]): Filter => ({
              type: 'checkbox',
              id: `${id}.${value}`,
              label: text,
              default: on(text),
            })),
          });
      };
      select(
        'sort',
        'Сортировка',
        document
          .select('select[name=sort] option')
          .map((o): [string, string] => [o.text(), (o.attr('value') ?? '').trim()]),
        'subscr_count',
      );
      checks('category', 'Категории', optionsOf(document, 'categories'), () => false);
      checks('rating', 'Возрастная категория', optionsOf(document, 'age-ratings'), (text) => text !== 'NC-17');
      select('type', 'Тип комикса', optionsOf(document, 'type'), '0');
      select('updatable', 'Публикация', optionsOf(document, 'updatable'), '0');
      select('subscribe', 'Подписка', optionsOf(document, 'subscribe'), '0');
      filters.push({ type: 'text', id: 'minPages', label: 'Минимум страниц', placeholder: '2' });
      return filters;
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      const article = document.selectFirst('article.common-article') ?? document;
      return {
        url: manga.url,
        title: article.selectFirst('.page-header-with-menu h1')?.text() || manga.title,
        genres: article.select('p.serial-about-badges a.category').map((a) => a.text()),
        author:
          [
            ...article.select('p.serial-about-authors a').map((a) => a.text()),
            ...selectIgnoreCase(article, 'p:contains(Автор оригинала)').map((p) =>
              p.text().replace(/^Автор оригинала:?/i, ''),
            ),
          ]
            .map((a) => a.trim())
            .filter(Boolean)
            .join(', ') || undefined,
        description: article.selectFirst('section.serial-about-text')?.text() || undefined,
        status: article.selectFirst('p.serial-about-badges span.completed') ? 'completed' : 'ongoing',
        thumbnailUrl: manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      const row = document.select('p').find((p) => p.selectFirst('b')?.text().includes('Количество выпусков:'));
      const count = Number.parseInt(row?.text().replace(/^.*Количество выпусков:/s, '') ?? '', 10);
      if (!count) throw new Error('Не удалось определить количество выпусков');
      const comicPath = manga.url.split('/about')[0]!;
      return Array.from({ length: count }, (_, i): Chapter => {
        const number = count - i;
        return { url: `${comicPath}/${number}`, name: String(number), number };
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(absoluteUrl(BASE_URL, chapter.url));
      const image = document.selectFirst('img.issue');
      if (!image) throw new Error('Страница не найдена');
      return [{ index: 0, imageUrl: image.absUrl('src') || image.attr('src') || '' }];
    },
    imageHeaders: () => ({ 'User-Agent': USER_AGENT }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?acomics\.ru\/(~[^/?#]+)/i.exec(url.trim());
      return match ? { url: `/${match[1]}/about`, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
