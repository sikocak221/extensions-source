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
import { USER_AGENT, parseDate } from './common/utils';

// Code that handled Saturday Morning Breakfast Comics lives in its own extension.
const BASE_URL = 'https://hiveworkscomics.com';
const headers = { 'User-Agent': USER_AGENT };

const POPULAR_MANGA_SELECTOR = 'div.comicblock';
const SEARCH_MANGA_SELECTOR = 'div.comicblock, div.originalsblock';
const CHAPTER_LIST_SELECTOR = 'select[name=comic] option';

type Option = [value: string, label: string];

/** Filters that add `/<param>/<value>` to the url; only one makes sense at a time. */
const URI_FILTERS: { id: string; label: string; param: string; options: Option[]; firstIsUnspecified: boolean }[] = [
  {
    id: 'updateDay',
    label: 'Update Day',
    param: 'update-day',
    firstIsUnspecified: true,
    options: [
      ['all', 'All'],
      ['monday', 'Monday'],
      ['tuesday', 'Tuesday'],
      ['wednesday', 'Wednesday'],
      ['thursday', 'Thursday'],
      ['friday', 'Friday'],
      ['saturday', 'Saturday'],
      ['sunday', 'Sunday'],
    ],
  },
  {
    id: 'rating',
    label: 'Rating',
    param: 'age',
    firstIsUnspecified: true,
    options: [
      ['all', 'All'],
      ['everyone', 'Everyone'],
      ['teen', 'Teen'],
      ['young-adult', 'Young Adult'],
      ['mature', 'Mature'],
    ],
  },
  {
    id: 'genre',
    label: 'Genre',
    param: 'genre',
    firstIsUnspecified: true,
    options: [
      ['all', 'All'],
      ['action/adventure', 'Action/Adventure'],
      ['animated', 'Animated'],
      ['autobio', 'Autobio'],
      ['comedy', 'Comedy'],
      ['drama', 'Drama'],
      ['dystopian', 'Dystopian'],
      ['fairytale', 'Fairytale'],
      ['fantasy', 'Fantasy'],
      ['finished', 'Finished'],
      ['historical-fiction', 'Historical Fiction'],
      ['horror', 'Horror'],
      ['lgbt', 'LGBT'],
      ['mystery', 'Mystery'],
      ['romance', 'Romance'],
      ['sci-fi', 'Science Fiction'],
      ['slice-of-life', 'Slice of Life'],
      ['steampunk', 'Steampunk'],
      ['superhero', 'Superhero'],
      ['urban-fantasy', 'Urban Fantasy'],
    ],
  },
  {
    id: 'title',
    label: 'Title',
    param: 'alpha',
    firstIsUnspecified: true,
    options: [
      ['all', 'All'],
      ...'abcdefghijklmnopqrstuvwxyz'.split('').map((c): Option => [c, c.toUpperCase()]),
      ['numbers-symbols', 'Numbers / Symbols'],
    ],
  },
  {
    id: 'sort',
    label: 'Sort By',
    param: 'sortby',
    firstIsUnspecified: true,
    options: [
      ['none', 'None'],
      ['a-z', 'A-Z'],
      ['z-a', 'Z-A'],
    ],
  },
];

const EXTRA_LISTS: { id: string; label: string; path: string }[] = [
  { id: 'originals', label: 'Original Comics', path: '/originals' },
  { id: 'kids', label: 'Kids Comics', path: '/kids' },
  { id: 'completed', label: 'Completed Comics', path: '/completed' },
  { id: 'hiatus', label: 'On Hiatus Comics', path: '/hiatus' },
];

const FILTERS: Filter[] = [
  { type: 'header', label: 'Only one filter can be used at a time' },
  { type: 'separator' },
  ...URI_FILTERS.map((f): Filter => ({
    type: 'select',
    id: f.id,
    label: f.label,
    options: f.options.map(([value, label]) => ({ value, label })),
    default: f.options[0]![0],
  })),
  { type: 'separator' },
  { type: 'header', label: 'Extra Lists' },
  ...EXTRA_LISTS.map((f): Filter => ({ type: 'checkbox', id: f.id, label: f.label })),
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

/** Url resolved against `base` the way okhttp's HttpUrl.resolve does (absolute, root-relative or relative). */
function resolveUrl(base: string, relative: string): string {
  if (/^https?:\/\//i.test(relative)) return relative;
  const origin = /^https?:\/\/[^/?#]+/i.exec(base)?.[0] ?? '';
  if (relative.startsWith('//')) return `${base.startsWith('http:') ? 'http:' : 'https:'}${relative}`;
  if (relative.startsWith('/')) return origin + relative;
  const path = base.slice(origin.length).replace(/[?#].*$/, '');
  const segments = path.split('/').slice(1, -1);
  for (const part of relative.split('/')) {
    if (part === '..') segments.pop();
    else if (part !== '.') segments.push(part);
  }
  return `${origin}/${segments.join('/')}`;
}

/** Appends path segments before the query string (Uri.Builder.appendPath). */
function appendPath(url: string, ...segments: string[]): string {
  const [path = '', query] = url.split('?');
  return `${path.replace(/\/+$/, '')}/${segments.join('/')}${query === undefined ? '' : `?${query}`}`;
}

function mangaFromElement(element: HtmlElement): MangaSummary & { author: string; description: string; genre: string } {
  const author = (element.selectFirst('h2')?.text() ?? '').replace(/^by/, '').trim();
  return {
    url: element.selectFirst('a.comiclink')?.absUrl('href') ?? '',
    title: element.selectFirst('h1')?.text() ?? '',
    thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined,
    author,
    description: element.selectFirst('div.description')?.text() ?? '',
    genre: element.selectFirst('div.comicrating')?.text() ?? '',
  };
}

function summary(manga: MangaSummary): MangaSummary {
  return { url: manga.url, title: manga.title, thumbnailUrl: manga.thumbnailUrl };
}

function comicBlocks(document: HtmlElement): MangaPage {
  const items = document
    .select(POPULAR_MANGA_SELECTOR)
    .filter((it) => {
      const url = it.selectFirst('a.comiclink')?.absUrl('href') ?? '';
      return !!url && !url.includes('sparklermonthly.com') && !url.includes('explosm.net'); // unsupported comics
    })
    .map((element) => summary(mangaFromElement(element)));
  return { items, hasNextPage: false };
}

function originalFromElement(element: HtmlElement): MangaSummary {
  const header = element.selectFirst('div.header')?.text() ?? '';
  const href = element.selectFirst('a')?.attr('href') ?? '';
  return {
    url: href,
    title: header.split('by')[0]!.trim(),
    thumbnailUrl: element.select('img')[1]?.absUrl('src') || undefined,
  };
}

async function searchList(
  url: string,
  query = '',
  transform: (element: HtmlElement) => MangaSummary = (e) => summary(mangaFromElement(e)),
): Promise<MangaPage> {
  const document = await load(url);
  const items = document
    .select(SEARCH_MANGA_SELECTOR)
    .filter((e) => !query || e.text().toLowerCase().includes(query.toLowerCase()))
    .map(transform);
  return { items, hasNextPage: false };
}

async function getWithErrors(url: string) {
  const response = await http.request<string>({ url, headers });
  if (response.status < 200 || response.status >= 300) {
    if (response.status === 404) throw new Error('This comic has a unsupported chapter list');
    throw new Error(`HiveWorks Comics HTTP Error ${response.status}`);
  }
  return response;
}

function chapterListParse(response: { url: string; body: string }): Chapter[] {
  const url = response.url;
  const document = html.load(response.body, { baseUrl: url });
  if (url.includes('witchycomic')) return witchyChapterListParse(document);
  if (url.includes('sssscomic')) return ssssChapterListParse(document, url);
  if (url.includes('awkwardzombie')) return awkwardzombieChapterListParse(document);

  const script = document
    .select('div script')
    .map((s) => s.html())
    .join('');
  const baseUrl = script.includes("href='") ? script.split("href='")[1]!.split("'")[0]! : script;
  const elements = document.select(CHAPTER_LIST_SELECTOR);
  if (elements.length === 0) throw new Error('This comic has a unsupported chapter list');
  let chapters = elements.slice(1).map((element): Chapter => {
    const text = element.text();
    const dash = text.indexOf('-');
    return {
      url: baseUrl + (element.attr('value') ?? ''),
      name: (dash < 0 ? text : text.slice(dash + 1)).trim(),
      uploadedAt: parseDate(dash < 0 ? text : text.slice(0, dash).trim(), 'MMM d, yyyy'),
    };
  });
  if (url.includes('checkpleasecomic'))
    chapters = chapters.filter((c) => c.name.endsWith('01') || c.name.endsWith(' 1'));
  return chapters.reverse();
}

function awkwardzombieChapterListParse(document: HtmlElement): Chapter[] {
  return document.select('div.archive-line').map((line) => {
    const date = line.selectFirst('.archive-date')?.text() ?? '';
    const number = date.slice(date.indexOf('#') + 1).split(',')[0]!;
    const comma = date.indexOf(', ');
    return {
      url: line.selectFirst('a')?.absUrl('href') ?? '',
      name: `#${number} ${line.selectFirst('div.archive-title')?.text() ?? ''} (${line.selectFirst('.archive-game')?.text() ?? ''})`,
      number: Number.parseFloat(number),
      uploadedAt: parseDate(comma < 0 ? date : date.slice(comma + 2), 'M-d-yy'),
    };
  });
}

// The chapters of witchycomic are its pages; the site shows no dates, so they get none.
function witchyChapterListParse(document: HtmlElement): Chapter[] {
  const elements = document.select('.cc-storyline-pagethumb a');
  if (elements.length === 0) throw new Error('This comic has a unsupported chapter list');
  return elements
    .slice(1)
    .map((a, i): Chapter => ({ url: a.attr('href') ?? '', name: `Page ${i + 1}` }))
    .filter((c) => c.url.includes('page-'))
    .reverse();
}

// sssscomic: adventure divs of page links, relative to the site root.
function ssssChapterListParse(document: HtmlElement, requestUrl: string): Chapter[] {
  const adventures = document.select('div[id^=adv]').length;
  const chapters: Chapter[] = [];
  for (let i = 1; i <= adventures; i++) {
    const elements = document.select(`#adv${i}Div a`);
    if (elements.length === 0) throw new Error('This comic has a unsupported chapter list');
    for (const a of elements) {
      chapters.push({
        url: resolveUrl(requestUrl, `../../${a.attr('href') ?? ''}`),
        name: `Adventure ${i} - Page ${a.text()}`,
      });
    }
  }
  return chapters.filter((c) => c.url.includes('page')).reverse();
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular() {
      return comicBlocks(await load(BASE_URL));
    },
    async getLatest() {
      const day = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()]!;
      return comicBlocks(await load(`${BASE_URL}/home/update-day/${day}`));
    },
    // The site has no search: the lists are filtered locally.
    async search(query: string, _page: number, filters: FilterState): Promise<MangaPage> {
      let url = appendPath(BASE_URL, 'home');
      for (const list of EXTRA_LISTS) {
        if (filters[list.id] === true) {
          return searchList(`${BASE_URL}${list.path}`, '', list.id === 'originals' ? originalFromElement : undefined);
        }
      }
      for (const filter of URI_FILTERS) {
        const value = filters[filter.id];
        if (typeof value !== 'string' || value === filter.options[0]![0]) continue;
        url = appendPath(url, filter.param, value);
      }
      return searchList(url, query.trim());
    },
    getFilters: () => FILTERS,
    // The details come from the home page block of the comic.
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(BASE_URL);
      const element = document
        .select(POPULAR_MANGA_SELECTOR)
        .find((e) => e.selectFirst('a.comiclink')?.absUrl('href') === manga.url);
      const found = element ? mangaFromElement(element) : undefined;
      return {
        url: manga.url,
        title: found?.title || manga.title,
        thumbnailUrl: found?.thumbnailUrl ?? manga.thumbnailUrl,
        author: found?.author || undefined,
        artist: found?.author || undefined,
        description: found?.description || undefined,
        genres: found?.genre ? [found.genre] : undefined,
        status: 'unknown',
        type: 'comic',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const url = manga.url;
      let archive: string;
      if (url.includes('sssscomic')) archive = `${url}${url.includes('?') ? '&' : '?'}id=archive`;
      else if (url.includes('awkwardzombie')) archive = appendPath(url, 'awkward-zombie', 'archive');
      else if (url.includes('smbc-comics'))
        throw new Error('Migrate to the Saturday Morning Breakfast Comics extension to read this comic');
      else archive = appendPath(url, 'comic', 'archive');
      return chapterListParse(await getWithErrors(archive));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.get(chapter.url, { headers });
      const document = html.load(response.body, { baseUrl: response.url });
      const pages: Page[] = document
        .select('div#cc-comicbody img')
        .map((img, index) => ({ index, imageUrl: img.attr('src') ?? '' }));
      if (response.url.includes('sssscomic')) {
        const path = document.selectFirst('img.comicnormal')?.attr('src') ?? '';
        pages.push({ index: pages.length, imageUrl: resolveUrl(response.url, `../../${path}`) });
      }
      return pages.map((p) => ({ ...p, imageUrl: resolveUrl(response.url, p.imageUrl ?? '') }));
    },
    getWebUrl: (item) => item.url,
  }),
});
