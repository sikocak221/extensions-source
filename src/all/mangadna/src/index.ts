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
import { USER_AGENT, imgAttr, parseDate, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://mangadna.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const option = (label: string, value: string) => ({ label, value });
const GENRES: [string, string][] = [
  ['Any', ''], ['Action', 'action'], ['Adult', 'adult'], ['Adventure', 'adventure'], ['Comedy', 'comedy'],
  ['Cooking', 'cooking'], ['Crime', 'crime'], ['Drama', 'drama'], ['Fantasy', 'fantasy'], ['Harem', 'harem'],
  ['Historical', 'historical'], ['Isekai', 'isekai'], ['Magic', 'magic'], ['Magical', 'magical'],
  ['Manhua', 'manhua'], ['Manhwa', 'manhwa'], ['Martial Arts', 'martial-arts'], ['Mature', 'mature'],
  ['Mystery', 'mystery'], ['Romance', 'romance'], ['School Life', 'school-life'], ['Sci-fi', 'sci-fi'],
  ['Shounen', 'shounen'], ['Shounen Ai', 'shounen-ai'], ['Slice of Life', 'slice-of-life'],
  ['Supernatural', 'supernatural'], ['Thriller', 'thriller'], ['Uncensored', 'uncensored'],
]; // prettier-ignore

function mangaList(document: HtmlElement): MangaPage {
  const items = document
    .select('div.home-item')
    .filter((card) => !(card.selectFirst('a[href]')?.attr('href') ?? '').replace(/\/$/, '').endsWith('-raw'))
    .flatMap((card): MangaSummary[] => {
      const link = card.selectFirst('h3.htitle a, .hthumb a');
      if (!link) return [];
      return [
        {
          url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
          title: link.attr('title') || link.text(),
          thumbnailUrl: imgAttr(card.selectFirst('img'), ['data-src', 'data-lazy-src', 'src']) || undefined,
        },
      ];
    });
  return { items, hasNextPage: document.selectFirst('ul.pagination li.next:not(.disabled) a') != null };
}

function parseStatus(raw: string | undefined): MangaStatus {
  switch (raw?.toLowerCase()) {
    case 'ongoing': return 'ongoing';
    case 'completed': case 'complete': case 'finished': return 'completed';
    case 'hiatus': case 'on hiatus': case 'on hold': return 'hiatus';
    case 'cancelled': case 'canceled': case 'dropped': return 'cancelled';
    default: return 'unknown';
  }
} // prettier-ignore

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    async getPopular(page: number): Promise<MangaPage> {
      return mangaList(await fetchDocument(`${BASE_URL}/manga/page/${page}?orderby=rating`));
    },

    async getLatest(page: number): Promise<MangaPage> {
      return mangaList(await fetchDocument(`${BASE_URL}/manga/page/${page}?orderby=latest`));
    },

    getFilters(): Filter[] {
      return [
        {
          type: 'select',
          id: 'genre',
          label: 'Genre (ignored when searching by query)',
          options: GENRES.map(([l, v]) => option(l, v)),
        },
        {
          type: 'select',
          id: 'sort',
          label: 'Sort by',
          options: [
            option('Latest', 'latest'),
            option('A-Z', 'alphabet'),
            option('Rating', 'rating'),
            option('Trending', 'trending'),
          ],
        },
      ];
    },

    async search(query: string, page: number, state: FilterState): Promise<MangaPage> {
      const q = query.trim();
      if (q) return mangaList(await fetchDocument(withQuery(`${BASE_URL}/search`, { q, page: String(page) })));
      const genre = typeof state.genre === 'string' ? state.genre : '';
      const sort = typeof state.sort === 'string' ? state.sort : '';
      const base = genre ? `${BASE_URL}/manga-genre/${genre}/${page}` : `${BASE_URL}/manga/page/${page}`;
      return mangaList(await fetchDocument(withQuery(base, sort ? { orderby: sort } : {})));
    },

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      return parseDetails(await fetchDocument(`${BASE_URL}${manga.url}`), manga);
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}`);
      await timers.sleep(0);
      const chapters: Chapter[] = [];
      for (const [i, li] of document.select('ul.row-content-chapter li.a-h').entries()) {
        if (i % 300 === 0) await timers.sleep(0);
        const link = li.selectFirst('a.chapter-name, a');
        if (!link) continue;
        const time = li.selectFirst('.chapter-time');
        chapters.push({
          url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
          name: link.text(),
          uploadedAt: parseDate(time?.attr('title') || time?.text(), 'dd MMM yy'),
        });
      }
      return chapters;
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await fetchDocument(`${BASE_URL}${chapter.url}`);
      return document
        .select('div.read-content img')
        .map((img, index) => ({ index, imageUrl: imgAttr(img, ['data-src', 'data-lazy-src', 'src']) }));
    },

    imageHeaders: () => headers,

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?mangadna\.com(\/manga\/[^/?#]+)/i.exec(url.trim());
      return match ? { url: match[1]!, title: '' } : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});

function parseDetails(document: HtmlElement, manga: MangaSummary): MangaDetails {
  const info = document.selectFirst('div.summary_content_wrap, div.tab-summary') ?? document;
  const rows: Record<string, string> = {};
  for (const item of info.select('div.post-content_item')) {
    const label = (item.selectFirst('.summary-heading')?.text() ?? '').replace(/:$/, '').trim();
    rows[label] = (item.selectFirst('.summary-content')?.text() ?? '').trim();
  }
  const names = (selector: string) => {
    const text = info
      .select(selector)
      .map((a) => a.text())
      .join(', ');
    return text && text !== 'Updating' ? text : undefined;
  };
  const type = rows.Type && rows.Type !== 'Updating' ? rows.Type : undefined;
  const genres = [
    ...new Set([
      ...info
        .select('div.genres-content a')
        .map((a) => a.text().trim())
        .filter(Boolean),
      ...(type ? [type] : []),
    ]),
  ];
  const parts: string[] = [];
  const synopsis =
    document.selectFirst('meta[property=og:description]')?.attr('content')?.trim() ||
    document.selectFirst('div.summary__content, div.dsct, div.manga-content p')?.text();
  if (synopsis) parts.push(synopsis);
  if (rows.Alternative && rows.Alternative !== 'Updating') parts.push(`Alternative: ${rows.Alternative}`);
  if (rows.Release) parts.push(`Released: ${rows.Release}`);
  const rating = info.selectFirst('#averagerate')?.text().trim();
  if (rating) {
    const max = info.selectFirst('[property=bestRating]')?.text().trim() || '5';
    const votes = info.selectFirst('#countrate')?.text().trim();
    parts.push(`Rating: ${rating} / ${max}${votes ? ` (${votes} votes)` : ''}`);
  }
  return {
    url: manga.url,
    title:
      document.selectFirst('h1.entry-title')?.text() ||
      document.selectFirst('div.post-title h1, h1')?.text() ||
      manga.title,
    thumbnailUrl:
      imgAttr(document.selectFirst('div.summary_image img'), ['data-src', 'data-lazy-src', 'src']) ||
      document.selectFirst('meta[property=og:image]')?.attr('content') ||
      manga.thumbnailUrl,
    author: names('div.author-content a'),
    artist: names('div.artist-content a'),
    genres,
    status: parseStatus(rows.Status),
    description: parts.join('\n\n') || undefined,
  };
}
