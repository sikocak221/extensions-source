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
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl, selectIgnoreCase } from './common/utils';

const BASE_URL = 'https://unicomics.ru';
const PATH_URL = '/comics/series/';
const PATH_PUBLISHERS = '/comics/publishers';
const PATH_EVENTS = '/comics/events';
const headers = { 'User-Agent': USER_AGENT };

const ISSUE_REGEX = /-\d+\/?$/;
const CHAPTER_NUMBER_REGEX = /№\s*(\d+(?:\.\d+)?)/;
const PAGINATOR_REGEX = /new Paginator\(['"].*?['"],\s*(\d+),\s*\d+,\s*\d+,\s*['"](.*?)['"]\)/;

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const abs = (element: HtmlElement | null | undefined, attr = 'href') => element?.absUrl(attr) || '';
const chapterNumber = (name: string) => {
  const match = CHAPTER_NUMBER_REGEX.exec(name)?.[1];
  return match ? Number.parseFloat(match) : undefined;
};

function cardToManga(element: HtmlElement): MangaSummary | null {
  const link = element.selectFirst('.comic-title-link') ?? element.selectFirst('a');
  const url = abs(link);
  if (!link || !url) return null;
  const title =
    element.selectFirst('.comic-title-ru')?.text() || element.selectFirst('.comic-title-en')?.text() || link.text();
  if (!title) return null;
  return {
    url: relativeUrl(url),
    title,
    thumbnailUrl: abs(element.selectFirst('.comic-image-link img, img'), 'src') || undefined,
  };
}

const hasNext = (document: HtmlElement) =>
  document.selectFirst('select.mobilePageSelector option[selected] ~ option') !== null;

function gridPage(document: HtmlElement): MangaPage {
  return {
    items: document.select('.comics-grid .comic-card').flatMap((e) => cardToManga(e) ?? []),
    hasNextPage: hasNext(document),
  };
}

async function listing(path: string, page: number): Promise<MangaPage> {
  return gridPage(await load(`${BASE_URL}${path}/page/${page}`));
}

function searchParse(document: HtmlElement, location: string): MangaPage {
  if (location.includes('yandex')) {
    if (document.selectFirst('.CheckboxCaptcha, .captcha__captcha'))
      throw new Error('Пройдите капчу Yandex в WebView (слишком много запросов)');
    const seen = new Set<string>();
    const items = document.select('.b-serp-item__title-link').flatMap((a): MangaSummary[] => {
      const href = abs(a);
      if (!href.includes('unicomics.ru')) return [];
      const series = href.replace('/comics/issue/', '/comics/series/').replace('/comics/online/', '/comics/series/');
      const url = relativeUrl(series.replace(ISSUE_REGEX, ''));
      if (seen.has(url)) return [];
      seen.add(url);
      return [{ url, title: a.text().split(' (')[0]!.split(' №')[0]! }];
    });
    return { items, hasNextPage: document.selectFirst('.b-pager__next') !== null };
  }
  if (location.includes(PATH_EVENTS)) {
    const items = document.select('.events-grid .event-card, .list_events').flatMap((element): MangaSummary[] => {
      const a = element.selectFirst('a');
      const url = abs(a);
      const title = element.selectFirst('.comic-title-ru, .event-title')?.text() || a?.text();
      if (!url || !title) return [];
      return [{ url: relativeUrl(url), title, thumbnailUrl: abs(element.selectFirst('img'), 'src') || undefined }];
    });
    return { items, hasNextPage: false };
  }
  return gridPage(document);
}

function mangaDetails(document: HtmlElement, manga: MangaSummary): MangaDetails {
  const info = (labels: HtmlElement[], values: HtmlElement[]) =>
    new Map(labels.map((l, i) => [l.text().replace(/:$/, ''), values[i]?.text() ?? '']));
  if (document.selectFirst('.issue-info-grid')) {
    const map = info(
      document.select('.issue-info-grid .issue-info-label'),
      document.select('.issue-info-grid .issue-info-value'),
    );
    return {
      url: manga.url,
      title: document.selectFirst('.issue-info h1')?.text() ?? manga.title,
      thumbnailUrl: abs(document.selectFirst('.issue-cover img'), 'src') || manga.thumbnailUrl,
      author: map.get('Издательство') || undefined,
      status: 'unknown',
      type: 'comic',
    };
  }
  const titleRu = document.selectFirst('.series-main h1')?.text();
  const titleEn = document.selectFirst('.series-main h2')?.text();
  const map = info(document.select('.series-info-grid .label'), document.select('.series-info-grid .value'));
  const description = [titleEn, document.selectFirst('.series-description')?.text()].filter(Boolean).join('\n\n');
  return {
    url: manga.url,
    title: titleRu || titleEn || manga.title,
    thumbnailUrl: abs(document.selectFirst('.cover-series img, .cover-series-mobile img'), 'src') || manga.thumbnailUrl,
    author: map.get('Издательство') || undefined,
    description: description || undefined,
    status: 'unknown',
    type: 'comic',
  };
}

function chapterFromElement(element: HtmlElement): Chapter {
  const readLink = selectIgnoreCase(element, '.buttons-grid a:contains(Читать)')[0];
  const url = abs(readLink) || abs(element.selectFirst('.comic-title-link'));
  const name = element.selectFirst('.comic-title-ru')?.text() || element.selectFirst('.comic-title-en')?.text() || '';
  return { url: relativeUrl(url), name, number: chapterNumber(name) };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => listing('/comics/series', page),
    getLatest: (page) => listing('/comics/online', page),
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      if (query.trim()) {
        const url = `https://yandex.ru/search/site/?searchid=14915852&text=${encodeURIComponent(query.trim())}&web=0&l10n=ru&p=${page - 1}`;
        const response = await http.get(url, { headers });
        return searchParse(html.load(response.body, { baseUrl: response.url }), response.url);
      }
      if (filters.events === 'on') {
        const response = await http.get(`${BASE_URL}${PATH_EVENTS}`, { headers });
        return searchParse(html.load(response.body, { baseUrl: response.url }), response.url);
      }
      const publisher = filters.publisher;
      if (typeof publisher === 'string' && publisher) {
        const response = await http.get(`${BASE_URL}${PATH_PUBLISHERS}/${publisher}/page/${page}`, { headers });
        return searchParse(html.load(response.body, { baseUrl: response.url }), response.url);
      }
      return listing('/comics/series', page);
    },
    async getFilters(): Promise<Filter[]> {
      const filters: Filter[] = [];
      try {
        const document = await load(`${BASE_URL}${PATH_PUBLISHERS}`);
        const publishers = document.select('.publishers-card > a:first-child').map((a) => ({
          label: a.text(),
          value: (a.attr('href') ?? '').split('/').pop() ?? '',
        }));
        if (publishers.length)
          filters.push({
            type: 'select',
            id: 'publisher',
            label: 'Издательства (только)',
            options: [{ label: 'Все', value: '' }, ...publishers],
            default: '',
          });
      } catch (error) {
        log.warn('Cannot load publishers', error);
      }
      filters.push({
        type: 'select',
        id: 'events',
        label: 'События (только)',
        options: [
          { label: 'Нет', value: 'off' },
          { label: 'в комиксах', value: 'on' },
        ],
        default: 'off',
      });
      return filters;
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      return mangaDetails(await load(absoluteUrl(BASE_URL, manga.url)), manga);
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(absoluteUrl(BASE_URL, manga.url));
      if (document.selectFirst('.issue-info-grid')) {
        const name = document.selectFirst('.issue-info h1')?.text() ?? 'Глава';
        const readButton = document.selectFirst('.btn-read-online-issues');
        return [
          {
            url: readButton ? relativeUrl(abs(readButton)) : manga.url,
            name,
            number: chapterNumber(name) ?? (CHAPTER_NUMBER_REGEX.test(name) ? 1 : undefined),
          },
        ];
      }
      const chapters = document.select('.comics-grid .comic-card').map(chapterFromElement);
      const pageUrls = document
        .select('select.mobilePageSelector option')
        .map((o) => abs(o, 'value'))
        .filter(Boolean)
        .slice(1);
      for (const pageUrl of pageUrls) {
        const next = await load(pageUrl);
        chapters.push(...next.select('.comics-grid .comic-card').map(chapterFromElement));
      }
      const title = (await mangaDetails(document, manga)).title;
      // A chapter named like the series gets a zero-width space, as in Tachiyomi (keeps the name apart from the title).
      return chapters.reverse().map((c) => (c.name === title ? { ...c, name: `​${c.name}` } : c));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.get(absoluteUrl(BASE_URL, chapter.url), { headers });
      const document = html.load(response.body, { baseUrl: response.url });
      const options = document.select('select.mobilePageSelector option');
      if (options.length > 0) return options.map((o, index) => ({ index, url: abs(o, 'value') }));
      const match = PAGINATOR_REGEX.exec(response.body);
      if (match) {
        const total = Number.parseInt(match[1]!, 10) || 1;
        return Array.from({ length: total }, (_, index) => ({ index, url: `${BASE_URL}${match[2]}${index + 1}` }));
      }
      return [{ index: 0, url: response.url }];
    },
    async getImageUrl(page: Page): Promise<string> {
      const document = await load(page.url ?? '');
      return abs(document.selectFirst('.image_online, #b_image, #image'), 'src');
    },
    imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/comics\/series\/[^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase().replace(/^www\./, '') === hostOf(BASE_URL)
        ? { url: match[2]!, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
