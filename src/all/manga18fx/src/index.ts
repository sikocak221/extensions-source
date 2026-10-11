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
import { USER_AGENT, parseDate, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://manga18fx.com';

const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

function mangaFromElement(element: HtmlElement): MangaSummary | null {
  // Matches both browse and "You may also like"
  const link = element.selectFirst('.tt > a');
  if (!link) return null;
  const title = link.text();
  if (title.endsWith(' Raw')) return null;
  const cover = element.selectFirst('a img[data-src]');
  return {
    url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
    title,
    thumbnailUrl: cover?.absUrl('src') || cover?.absUrl('data-src') || undefined,
  };
}

function mangaParse(document: HtmlElement): MangaPage {
  const items = (document.selectFirst('.site-body > .bixbox:last-child')?.select('.page-item') ?? []).flatMap((el) => {
    const manga = mangaFromElement(el);
    return manga ? [manga] : [];
  });
  return { items, hasNextPage: document.selectFirst('#blog-pager li.next:not(.disabled)') != null };
}

const GENRES: [string, string | ''][] = [
  ['<select>', ''], ['Adult', 'adult'], ['Drama', 'drama'], ['Harem', 'harem'], ['Seinen', 'seinen'],
  ['School', 'school-life'], ['Mature', 'mature'], ['Psychological', 'psychological'], ['Romance', 'romance'],
  ['Tragedy', 'tragedy'], ['Ecchi', 'ecchi'], ['Sci', 'sci-fi'], ['Yaoi', 'yaoi'], ['Action', 'action'],
  ['Martial', 'martial-arts'], ['Smut', 'smut'], ['Sports', 'sports'], ['Comedy', 'comedy'], ['Yuri', 'yuri'],
  ['Slice', 'slice-of-life'], ['Manhwa', 'manhwa'], ['Manhua', 'manhua'], ['Fantasy', 'fantasy'],
  ['Horror', 'horror'], ['Supernatural', 'supernatural'], ['Hentai', 'hentai'], ['Isekai', 'isekai'],
  ['Shoujo', 'shoujo'], ['Adventure', 'adventure'], ['Shounen', 'shounen'], ['Mecha', 'mecha'],
  ['Mystery', 'mystery'], ['Thriller', 'thriller'], ['Historical', 'historical'], ['Josei', 'josei'],
  ['Gender', 'gender-bender'], ['Webtoons', 'webtoons'], ['RPG', 'rpg'], ['GL', 'gl'], ['BL', 'bl'],
  ['Raw', 'raw'], ['Reincarnation', 'reincarnation'], ['Zombie', 'zombie'], ['Magic', 'magic'],
  ['Comics', 'comics'], ['Webtoon', 'webtoon'], ['Cooking', 'cooking'], ['NTR', 'ntr'],
  ['Doujinshi', 'doujinshi'], ['Game', 'game'], ['Vanilla', 'vanilla'], ['Demons', 'demons'],
  ['Family', 'family'], ['Super', 'super-power'], ['Uncensored', 'uncensored-manhwa'],
]; // prettier-ignore

function toStatus(text: string | undefined): MangaStatus {
  if (text === 'Ongoing') return 'ongoing';
  if (text === 'Completed') return 'completed';
  return 'unknown';
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    async getPopular(page: number): Promise<MangaPage> {
      return mangaParse(
        await fetchDocument(withQuery(`${BASE_URL}/hot-manga`, page > 1 ? { page: String(page) } : {})),
      );
    },

    async getLatest(page: number): Promise<MangaPage> {
      return mangaParse(await fetchDocument(`${BASE_URL}/page/${page}`));
    },

    getFilters(): Filter[] {
      return [
        {
          type: 'select',
          id: 'genre',
          label: 'Genre (not used with text search)',
          options: GENRES.map(([label, value]) => ({ label, value })),
        },
        {
          type: 'select',
          id: 'orderby',
          label: 'Order by',
          options: [
            { label: 'Default', value: '' },
            { label: 'Latest', value: 'latest' },
            { label: 'Rating', value: 'rating' },
            { label: 'Most Views', value: 'views' },
          ],
        },
      ];
    },

    async search(query: string, page: number, state: FilterState): Promise<MangaPage> {
      if (query.trim()) {
        const params: Record<string, string> = { q: query.replace(/'/g, '’') };
        if (page > 1) params.page = String(page);
        return mangaParse(await fetchDocument(withQuery(`${BASE_URL}/search`, params)));
      }
      const genre = typeof state.genre === 'string' ? state.genre : '';
      const orderby = typeof state.orderby === 'string' ? state.orderby : '';
      if (!genre) return mangaParse(await fetchDocument(`${BASE_URL}/hot-manga${page > 1 ? `?page=${page}` : ''}`));
      const url = `${BASE_URL}/manga-genre/${genre}${page > 1 ? `/${page}` : ''}`;
      return mangaParse(await fetchDocument(withQuery(url, orderby ? { orderby } : {})));
    },

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}`);
      const names = (selector: string) => {
        const text = document
          .select(selector)
          .map((a) => a.text())
          .join(', ');
        return text && text !== 'Updating' ? text : undefined;
      };
      const description: string[] = [];
      const rate = document.selectFirst('#averagerate')?.text();
      const rateCount = Number.parseInt(document.selectFirst('#countrate')?.text() ?? '', 10) || 0;
      const rating = Number.parseFloat(rate ?? '');
      if (rate && rating > 0)
        description.push(
          `Rating: ${'★'.repeat(Math.round(rating))}${'☆'.repeat(5 - Math.round(rating))} ${rate}${rateCount > 0 ? ` (${rateCount})` : ''}`,
        );
      const comments = Number.parseInt(document.selectFirst('.list-comments > h4')?.text().split(' ')[0] ?? '', 10);
      if (!Number.isNaN(comments)) description.push(`Comments: ${comments}`);
      const bookmarks = Number.parseInt(document.selectFirst('.sumbmrk')?.text().split(' ')[0] ?? '', 10);
      if (!Number.isNaN(bookmarks)) description.push(`Bookmarks: ${bookmarks}`);
      const text = document.selectFirst('.dsct')?.text().trim();
      if (text) description.push(text);
      const alternatives = document
        .selectFirst('.summary-heading:has(h5:contains(Alternative)) + .summary-content')
        ?.text()
        .split(' / ');
      if (alternatives && alternatives[0] !== 'N/A')
        description.push(`Alternative titles:\n${alternatives.map((t) => `- ${t}`).join('\n')}`);
      const type = document.selectFirst('.summary-heading:has(h5:contains(Type)) + .summary-content')?.text();
      const genres = [
        ...new Set([...(type ? [type] : []), ...document.select('.genres-content > a').map((a) => a.text())]),
      ];
      return {
        url: manga.url,
        title: document.selectFirst('.post-title > h1')?.text() || manga.title,
        thumbnailUrl: document.selectFirst('.summary_image img')?.absUrl('src') || manga.thumbnailUrl,
        author: names('.author-content > a'),
        artist: names('.artist-content > a'),
        description: description.join('\n\n') || undefined,
        genres,
        status: toStatus(document.selectFirst('.summary-heading:has(h5:contains(Status)) + .summary-content')?.text()),
      };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}`);
      await timers.sleep(0);
      const chapters: Chapter[] = [];
      for (const [i, el] of document.select('#chapterlist li.a-h').entries()) {
        if (i % 300 === 0) await timers.sleep(0);
        const link = el.selectFirst('a.chapter-name');
        if (!link) continue;
        const date = el.selectFirst('.chapter-time')?.text();
        chapters.push({
          url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
          name: link.text(),
          uploadedAt: date ? parseDate(date, 'dd MMM yy') : undefined,
        });
      }
      return chapters;
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await fetchDocument(`${BASE_URL}${chapter.url}`);
      return document
        .select('.page-break > img')
        .map((img) => img.absUrl('src') || img.attr('src') || '')
        .filter(Boolean)
        .map((imageUrl, index) => ({ index, imageUrl }));
    },

    imageHeaders: () => headers,

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?manga18fx\.com(\/manga\/[^/?#]+)/i.exec(url.trim());
      return match ? { url: match[1]!, title: '' } : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
