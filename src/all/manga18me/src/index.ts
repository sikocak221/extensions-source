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

const BASE_URL = 'https://manga18.me';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const option = (label: string, value: string) => ({ label, value });
const GENRES: [string, string][] = [
  ['Manga', 'manga'], ['Drama', 'drama'], ['Mature', 'mature'], ['Romance', 'romance'], ['Adult', 'adult'],
  ['Hentai', 'hentai'], ['Comedy', 'comedy'], ['Ecchi', 'ecchi'], ['School Life', 'school-life'],
  ['Shounen', 'shounen'], ['Slice of Life', 'slice-of-life'], ['Seinen', 'seinen'], ['Yuri', 'yuri'],
  ['Action', 'action'], ['Fantasy', 'fantasy'], ['Harem', 'harem'], ['Supernatural', 'supernatural'],
  ['Sci-Fi', 'sci-fi'], ['Isekai', 'isekai'], ['Shoujo', 'shoujo'], ['Horror', 'horror'],
  ['Psychological', 'psychological'], ['Smut', 'smut'], ['Tragedy', 'tragedy'], ['Raw', 'raw'],
  ['Historical', 'historical'], ['Adventure', 'adventure'], ['Martial Arts', 'martial-arts'],
  ['Manhwa', 'manhwa'], ['Manhua', 'manhua'], ['Mystery', 'mystery'], ['BL', 'bl'], ['Yaoi', 'yaoi'],
  ['Gender Bender', 'gender-bender'], ['Thriller', 'thriller'], ['Josei', 'josei'], ['Sports', 'sports'],
  ['GL', 'gl'], ['Family', 'family'], ['Magic', 'magic'],
]; // prettier-ignore

function mangaList(document: HtmlElement): MangaPage {
  const items = document.select('div.page-item-detail').flatMap((el): MangaSummary[] => {
    const link = el.selectFirst('a');
    const title = el.selectFirst('div.item-thumb.wleft img')?.attr('alt');
    if (!link || !title) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title,
        thumbnailUrl: el.selectFirst('img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('.next') != null };
}

function parseStatus(text: string | undefined): MangaStatus {
  if (text === 'Ongoing') return 'ongoing';
  if (text === 'Completed') return 'completed';
  return 'unknown';
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    async getPopular(page: number): Promise<MangaPage> {
      return mangaList(await fetchDocument(`${BASE_URL}/manga/${page}?orderby=trending`));
    },

    async getLatest(page: number): Promise<MangaPage> {
      return mangaList(await fetchDocument(`${BASE_URL}/manga/${page}?orderby=latest`));
    },

    getFilters(): Filter[] {
      return [
        {
          type: 'select',
          id: 'genre',
          label: 'Genre (ignored when using text search)',
          options: GENRES.map(([l, v]) => option(l, v)),
        },
        {
          type: 'select',
          id: 'sort',
          label: 'Sort',
          options: [
            option('Latest', 'latest'),
            option('A-Z', 'alphabet'),
            option('Rating', 'rating'),
            option('Trending', 'trending'),
          ],
        },
        { type: 'checkbox', id: 'raw', label: 'Raw' },
        { type: 'checkbox', id: 'completed', label: 'Completed' },
      ];
    },

    async search(query: string, page: number, state: FilterState): Promise<MangaPage> {
      if (query) {
        return mangaList(await fetchDocument(withQuery(`${BASE_URL}/search`, { q: query, page: String(page) })));
      }
      const genre = typeof state.genre === 'string' && state.genre ? state.genre : 'manga';
      const sort = typeof state.sort === 'string' && state.sort ? state.sort : 'latest';
      let path: string;
      if (state.raw === true) path = '/raw';
      else if (state.completed === true) path = '/completed';
      else path = genre === 'manga' ? '/manga' : `/genre/${genre}`;
      return mangaList(await fetchDocument(withQuery(`${BASE_URL}${path}/${page}`, { orderby: sort })));
    },

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}`);
      const info = document.selectFirst('div.post_content');
      const description: string[] = [];
      const synopsis = document.selectFirst('div.ss-manga')?.text().trim();
      if (synopsis && synopsis !== 'N/A') description.push(synopsis);
      const alt = info?.selectFirst('div.post-content_item.wleft:contains(Alternative) div.summary-content')?.text();
      if (alt && alt !== 'Updating') {
        description.push(
          `Alternative Names:\n${alt
            .split(/[/;]/)
            .map((a) => `- ${a.trim()}`)
            .join('\n')}`,
        );
      }
      const artist = info?.selectFirst('div.href-content.artist-content > a')?.text();
      const person = artist && artist !== 'Updating' ? artist : undefined;
      return {
        url: manga.url,
        title: document.selectFirst('div.post-title.wleft > h1')?.text() || manga.title,
        thumbnailUrl: document.selectFirst('div.summary_image > img')?.absUrl('src') || manga.thumbnailUrl,
        description: description.join('\n\n') || undefined,
        status: parseStatus(
          info?.selectFirst('div.post-content_item.wleft:contains(Status) div.summary-content')?.text(),
        ),
        author: person,
        artist: person,
        genres: info?.select('div.href-content.genres-content > a[href*=/manga-list/]').map((a) => a.text()) ?? [],
      };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}`);
      await timers.sleep(0);
      const chapters: Chapter[] = [];
      for (const [i, el] of document.select('ul.row-content-chapter.wleft .a-h.wleft').entries()) {
        if (i % 300 === 0) await timers.sleep(0);
        const link = el.selectFirst('a');
        if (!link) continue;
        chapters.push({
          url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
          name: link.text(),
          uploadedAt: parseDate(el.selectFirst('span')?.text(), 'dd MMM yyyy'),
        });
      }
      return chapters;
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await fetchDocument(`${BASE_URL}${chapter.url}`);
      const images = document.select('div.read-content.wleft img');
      if (images.length === 0) throw new Error('Unable to find script with image data');
      return images.map((img, index) => ({ index, imageUrl: imgAttr(img, ['src']) }));
    },

    imageHeaders: () => headers,

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?manga18\.me(\/manga\/[^/?#]+)/i.exec(url.trim());
      return match ? { url: match[1]!, title: '' } : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
