import {
  type Chapter,
  type Filter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, ownText, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://3hentai.net';
const HEADERS = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const PREF_FULL_TITLE = 'full_title';
const SHORT_TITLE_REGEX = /(\[[^\]]*\]|[({][^)}]*[)}])/g;

const SEARCH_LANG: Record<string, string> = {
  all: '',
  en: 'english',
  ja: 'japanese',
  ko: 'korean',
  zh: 'chinese',
  mo: 'mongolian',
  es: 'spanish',
  pt: 'Portuguese',
  id: 'indonesian',
  jv: 'javanese',
  tl: 'tagalog',
  vi: 'vietnamese',
  th: 'thai',
  my: 'burmese',
  tr: 'turkish',
  ru: 'russian',
  uk: 'ukrainian',
  pl: 'polish',
  fi: 'finnish',
  de: 'german',
  it: 'italian',
  fr: 'french',
  nl: 'dutch',
  cs: 'czech',
  hu: 'hungarian',
  bg: 'bulgarian',
  is: 'icelandic',
  la: 'latin',
  ar: 'arabic',
};

const SORTS: [string, string][] = [
  ['Recent', ''],
  ['Popular: All Time', 'popular'],
  ['Popular: Week', 'popular-7d'],
  ['Popular: Today', 'popular-24h'],
];

// [label, search type, specific namespace]
const TEXT_FILTERS: [string, string, string][] = [
  ['Tags', 'tags', ''],
  ['Male Tags', 'tags', 'male'],
  ['Female Tags', 'tags', 'female'],
  ['Series', 'series', ''],
  ['Characters', 'characters', ''],
  ['Artists', 'artist', ''],
  ['Groups', 'groups', ''],
  ['Languages', 'language', ''],
  ['Pages', 'page', ''],
];
const filterId = (index: number): string => `text.${index}`;

const preferences: Preference[] = [
  { type: 'switch', key: PREF_FULL_TITLE, label: 'Display full title', default: false },
];

const shortenTitle = (title: string): string =>
  (prefs.get<boolean>(PREF_FULL_TITLE) ?? false) ? title : title.replace(SHORT_TITLE_REGEX, '').trim();

const capitalizeEach = (text: string): string =>
  text
    .split(' ')
    .map((word) => (word ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(' ');

async function fetchDocument(url: string): Promise<{ document: HtmlElement; url: string }> {
  const response = await http.get(url, { headers: HEADERS });
  return { document: html.load(response.body, { baseUrl: response.url }), url: response.url };
}

function thumbOf(img: HtmlElement | null): string | undefined {
  if (!img) return undefined;
  return img.attr('data-src') || img.absUrl('src');
}

function parseMangasPage(document: HtmlElement): MangaPage {
  const items = document.select('a[href*="/d/"]').flatMap((element): MangaSummary[] => {
    const title = element.selectFirst('div.title');
    if (!title) return [];
    return [
      {
        url: relativeUrl(element.absUrl('href') || element.attr('href') || ''),
        title: shortenTitle(ownText(title) || title.text()),
        thumbnailUrl: element.selectFirst('img:not([class])')?.absUrl('src'),
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('a[rel=next]') !== null };
}

function joined(document: HtmlElement, selector: string): string {
  return document
    .select(selector)
    .map((a) => a.text())
    .join(', ');
}

function parseDetails(document: HtmlElement, url: string): MangaDetails {
  const authors = joined(document, 'a[href*="/groups/"]');
  const artists = joined(document, 'a[href*="/artists/"]');
  const section = (label: string, selector: string): string => {
    const value = joined(document, selector);
    return value ? `${label}: ${capitalizeEach(value)}\n\n` : '';
  };
  const description =
    section('Characters', 'a[href*="/characters/"]') +
    section('Series', 'a[href*="/series/"]') +
    section('Groups', 'a[href*="/groups/"]') +
    section('Languages', 'a[href*="/language/"]') +
    `${document
      .select('div.tag-container:contains(pages:)')
      .map((e) => e.text())
      .join(' ')}\n`;
  return {
    url: relativeUrl(url),
    title: shortenTitle(document.selectFirst('h1')?.text() ?? ''),
    author: authors || artists || undefined,
    artist: artists || authors || undefined,
    genres: document.select('a[href*="/tags/"]').map((a) => {
      const capitalized = capitalizeEach(a.text());
      return capitalized.includes('male')
        ? capitalized.replace('(female)', '♀').replace('(male)', '♂')
        : `${capitalized} ◊`;
    }),
    description,
    thumbnailUrl: thumbOf(document.selectFirst('img')),
    status: 'completed',
  };
}

export default defineExtension({
  preferences: () => preferences,
  createSource: ({ lang }) => {
    const searchLang = SEARCH_LANG[lang] ?? '';

    const popularOrLatest = async (page: number, popular: boolean): Promise<MangaPage> => {
      let url: string;
      if (searchLang) {
        url = `${BASE_URL}/language/${searchLang}/${popular ? (page > 1 ? page : '') : page}`;
        if (popular) url += '?sort=popular';
      } else {
        url = `${BASE_URL}/search?q=pages%3A>0&page=${page}${popular ? '&sort=popular' : ''}`;
      }
      try {
        return parseMangasPage((await fetchDocument(url)).document);
      } catch (error) {
        // languages without any gallery answer 404
        if (searchLang && String(error).includes('404')) return { items: [], hasNextPage: false };
        throw error;
      }
    };

    return {
      baseUrl: BASE_URL,
      getPopular: (page) => popularOrLatest(page, true),
      getLatest: (page) => popularOrLatest(page, false),
      search: async (query, page, filters) => {
        const sort = typeof filters.sort === 'string' ? filters.sort : '';
        let tags = '';
        TEXT_FILTERS.forEach(([, type, specific], index) => {
          const value = filters[filterId(index)];
          if (typeof value !== 'string') return;
          for (const raw of value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)) {
            const tag = raw.toLowerCase();
            if (tag.startsWith('-')) tags += '-';
            tags += type;
            if (type === 'page') tags += `:${tag}`;
            else {
              tags += `:'${tag.replace(/^-/, '')}`;
              if (specific) tags += ` (${specific})`;
              tags += "' ";
            }
          }
        });
        const language = searchLang ? `language:${searchLang}` : '';
        const url = withQuery(`${BASE_URL}/search`, {
          q: `${query} ${language} ${tags}`,
          page: page > 1 ? String(page) : undefined,
          sort,
        });
        return parseMangasPage((await fetchDocument(url)).document);
      },
      getFilters: (): Filter[] => [
        { type: 'select', id: 'sort', label: 'Sort by', options: SORTS.map(([label, value]) => ({ label, value })) },
        { type: 'separator' },
        { type: 'header', label: 'Separate tags with commas (,)' },
        { type: 'header', label: 'Prepend with dash (-) to exclude' },
        {
          type: 'header',
          label: "Use 'Male Tags' or 'Female Tags' for specific categories. 'Tags' searches all categories.",
        },
        ...TEXT_FILTERS.slice(0, 8).map(([label], index): Filter => ({ type: 'text', id: filterId(index), label })),
        { type: 'separator' },
        { type: 'header', label: 'Filter by pages, for example: (>20)' },
        { type: 'text', id: filterId(8), label: 'Pages' },
      ],
      getMangaDetails: async (manga) => {
        const { document, url } = await fetchDocument(BASE_URL + manga.url);
        return parseDetails(document, url);
      },
      getChapters: async (manga): Promise<Chapter[]> => {
        const { document, url } = await fetchDocument(BASE_URL + manga.url);
        const datetime = document.selectFirst('time')?.attr('datetime');
        const time = datetime ? Date.parse(datetime) : Number.NaN;
        return [{ url: relativeUrl(url), name: 'Chapter', uploadedAt: Number.isNaN(time) ? undefined : time }];
      },
      getPages: async (chapter): Promise<Page[]> => {
        const { document } = await fetchDocument(BASE_URL + chapter.url);
        // the thumbnails are lazy-loaded (the plain <img> copies sit in <noscript>, which the sandbox keeps as text)
        const lazy = document
          .select('img[data-src]')
          .map((img) => img.absUrl('data-src') || img.attr('data-src') || '');
        const cover = lazy.find((src) => /\/cover\./.test(src));
        const prefix = cover ? cover.slice(0, cover.lastIndexOf('/') + 1) : '';
        const thumbs = lazy.filter((src) => src && !/\/cover\./.test(src) && (!prefix || src.startsWith(prefix)));
        const plain = document
          .select('img:not([class]):not([src*=thumb]):not([src*=cover])')
          .map((image) => image.absUrl('src') || '')
          .filter(Boolean);
        return [...new Set(thumbs.length ? thumbs : plain)].map((src, index) => ({
          index,
          imageUrl: src.replace(/t(?=\.)/, ''),
        }));
      },
      imageHeaders: () => HEADERS,
      resolveUrl: (url) => {
        if (hostOf(url) !== hostOf(BASE_URL)) return null;
        const id = /\/d\/([^/?#]+)/.exec(url)?.[1];
        return id ? { url: `/d/${id}`, title: '' } : null;
      },
      getWebUrl: (item) => BASE_URL + item.url,
    };
  },
});
