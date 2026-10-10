import {
  type Chapter,
  type Filter,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, parseDate, withQuery } from './common/utils';

const BASE_URL = 'https://rokuhentai.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const IMG_REGEX = /background-image: url\("(.+?)"\);/;

/** Paging key of the next page of a listing (the id of the last manga of the previous page). */
const offsets = new Map<string, string>();

/** The manga url is `/<id>#<pages>,<epoch ms>`; the id is the last path segment. */
const idOf = (url: string) => url.split('#')[0]!.split('/').pop()!;

function parseManga(element: HtmlElement): MangaSummary | null {
  const info = element.selectFirst('.mdc-typography--caption:last-child')?.text().split(' images ');
  const title = element.selectFirst('.site-manga-card__title--primary')?.text();
  const href = element.absUrl('href') ?? '';
  if (!info || info.length < 2 || !title || !href) return null;
  const date = parseDate(info[1], 'MMM d, yyyy, h:mm a');
  const path = href.replace(/^https?:\/\/[^/]+/, '').replace(/\/[^/]*$/, '');
  return {
    url: `${path}#${info[0]},${date ?? 0}`,
    title,
    thumbnailUrl: IMG_REGEX.exec(element.selectFirst('.mdc-card__media')?.attr('style') ?? '')?.[1],
  };
}

async function parseMangasPage(url: string, key: string): Promise<MangaPage> {
  const response = await http.get(url, { headers });
  const type = Object.entries(response.headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? '';
  const slots: HtmlElement[] = type.includes('text/html')
    ? html.load(response.body, { baseUrl: BASE_URL }).select('.mdc-card > .site-popunder-ad-slot')
    : (JSON.parse(response.body) as { 'manga-cards': string[] })['manga-cards'].flatMap((card) => {
        const slot = html.load(card, { baseUrl: BASE_URL }).selectFirst('.site-popunder-ad-slot');
        return slot ? [slot] : [];
      });
  const items = slots.flatMap((slot) => parseManga(slot) ?? []);
  const last = items[items.length - 1];
  if (last) offsets.set(key, idOf(last.url));
  return { items, hasNextPage: items.length > 0 };
}

export default defineExtension({
  preferences: () => [
    {
      type: 'switch',
      key: 'THUMBNAIL',
      label: 'Use thumbnails instead of the original images',
      description: 'After enabling, each page of the manga will display smaller and blurrier thumbnail.',
      default: false,
    },
  ],

  createSource: () => ({
    baseUrl: BASE_URL,

    getPopular: (page: number) =>
      parseMangasPage(
        page === 1 ? BASE_URL : withQuery(`${BASE_URL}/_search`, { p: offsets.get('popular') ?? '' }),
        'popular',
      ),

    getFilters(): Filter[] {
      return [
        { type: 'header', label: 'Search How-To:' },
        { type: 'header', label: '• Search for a phrase in manga titles: this is a title.' },
        {
          type: 'header',
          label:
            '• Titles containing all phrases (double quotes are required to separate phrases): "this foo" "that bar".',
        },
        { type: 'header', label: '• Exclude manga titles containing a phrase with "-": -"this is excluded".' },
        {
          type: 'header',
          label: '• Filter mangas by tag: group:foo. Double-quote a tag with spaces: parody:"foo bar".',
        },
        { type: 'header', label: '• Filter mangas by date: after:2000-01-01 before:2000-02.' },
        { type: 'header', label: '• Negate a filter with "-": -language:foo.' },
      ];
    },

    async search(query: string, page: number): Promise<MangaPage> {
      const key = `search:${query}`;
      const url =
        page > 1
          ? withQuery(`${BASE_URL}/_search`, { q: query, p: offsets.get(key) ?? '' })
          : withQuery(BASE_URL, { q: query });
      return parseMangasPage(url, key);
    },

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const response = await http.get(`${BASE_URL}/${idOf(manga.url)}`, { headers });
      const doc = html.load(response.body, { baseUrl: response.url });
      const img = doc.selectFirst('.site-manga-info .mdc-card__media');
      const titles = doc.select('.site-manga-info__info h6');
      let author: string | undefined;
      const genres = doc.select('.mdc-chip').map((chip) => {
        const text = chip.text().split(': ');
        if (text[0] === 'artist') author = text[1];
        return text[1]?.includes(' ') ? `${text[0]}: "${text[1]}"` : chip.text();
      });
      return {
        url: manga.url,
        title: manga.title,
        thumbnailUrl: IMG_REGEX.exec(img?.attr('style') ?? '')?.[1] ?? manga.thumbnailUrl,
        description: titles[1]?.text(),
        author,
        genres,
        status: 'completed',
      };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const [pages, date] = (manga.url.split('#')[1] ?? '0,0').split(',');
      return [
        {
          url: idOf(manga.url),
          name: manga.title,
          number: 0,
          scanlator: `${pages}P`,
          uploadedAt: Number(date) || undefined,
        },
      ];
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const size = Number.parseInt(chapter.scanlator ?? '0', 10);
      const path = prefs.get<boolean>('THUMBNAIL') === true ? 'page-thumbnails' : 'pages';
      return Array.from({ length: size }, (_, i) => ({
        index: i,
        imageUrl: `${BASE_URL}/_images/${path}/${chapter.url}/${i}.jpg`,
      }));
    },

    imageHeaders: () => headers,

    // No resolveUrl: the manga url carries the page count and date, which a web link does not have.

    getWebUrl: (item: MangaSummary | Chapter) =>
      item.url.includes('/') ? `${BASE_URL}${item.url.split('#')[0]}` : `${BASE_URL}/${item.url}/0#top-to-bottom`,
  }),
});
