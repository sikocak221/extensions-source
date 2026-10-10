import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type SourceInfo,
  defineExtension,
} from '@matane/extension-sdk';
import { parseDate, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://mangaplus-creators.jp';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

/** The title content id is the third path segment of its thumbnail url. */
function contentId(thumbnail: string): string {
  return thumbnail.replace(/^https?:\/\/[^/]+/, '').split('/')[3] ?? '';
}

function elementToManga(element: HtmlElement): MangaSummary | null {
  const thumbnail = element.selectFirst('.image-area img')?.attr('src');
  const title = element.selectFirst('.title-area .title')?.text();
  if (!thumbnail || !title) return null;
  return { url: `/titles/${contentId(thumbnail)}`, title, thumbnailUrl: thumbnail };
}

async function mangaPage(url: string, selector: string): Promise<MangaPage> {
  const document = await fetchDocument(url);
  const items = document.select(selector).flatMap((el) => elementToManga(el) ?? []);
  return { items, hasNextPage: false };
}

interface MpcTitle {
  title: string;
  thumbnail: string;
  author: { name: string };
  latest_episode: { title_connect_id: string };
}

const option = (label: string, value: string) => ({ label, value });

export default defineExtension({
  createSource: (info: SourceInfo) => {
    const lang = info.lang;

    async function chapterPage(titleId: string, page: number): Promise<{ chapters: Chapter[]; hasNext: boolean }> {
      const document = await fetchDocument(`${BASE_URL}/titles/${titleId}/?page=${page}`);
      const chapters = document.select('.mod-item-series').map((el): Chapter => {
        const episode = (el.attr('href') ?? '').split('/').pop()!;
        const numberText = el.selectFirst('.number')?.text() ?? '';
        const number = Number.parseFloat(numberText.split('#')[1] ?? '');
        return {
          url: `/episodes/${episode}`,
          name: numberText,
          number: numberText === 'One-shot' ? 0 : Number.isNaN(number) ? undefined : number,
          uploadedAt: parseDate(el.selectFirst('.first-update')?.text(), 'yyyy-MM-dd'),
        };
      });
      return { chapters, hasNext: document.select('.mod-pagination .next').length > 0 };
    }

    return {
      baseUrl: BASE_URL,

      getPopular: () => mangaPage(`${BASE_URL}/titles/popular/?p=m&l=${lang}`, 'div.item-recent'),

      async getLatest(page: number): Promise<MangaPage> {
        const response = await http.get<{ status: string; titles?: MpcTitle[] }>(
          withQuery(`${BASE_URL}/api/titles/recent/`, { page: String(page), l: lang, t: 'episode' }),
          { headers, responseType: 'json' },
        );
        const titles = response.body.titles ?? [];
        return {
          items: titles.map((t) => ({
            url: `/titles/${t.latest_episode.title_connect_id}`,
            title: t.title,
            thumbnailUrl: t.thumbnail,
          })),
          hasNextPage: response.body.status !== 'error' && titles.length > 0,
        };
      },

      getFilters(): Filter[] {
        return [
          { type: 'header', label: 'NOTE: Ignored if using text search!' },
          {
            type: 'select',
            id: 'sort',
            label: 'Sort',
            options: [option('Popularity', ''), option('Date', 'latest_desc'), option('Likes', 'like_desc')],
          },
          {
            type: 'select',
            id: 'genre',
            label: 'Genres',
            options: [
              option('Fantasy', 'fantasy'),
              option('Action', 'action'),
              option('Romance', 'romance'),
              option('Horror', 'horror'),
              option('Slice of Life', 'slice_of_life'),
              option('Comedy', 'comedy'),
              option('Sports', 'sports'),
              option('Sci-Fi', 'sf'),
              option('Mystery', 'mystery'),
              option('Others', 'others'),
            ],
          },
        ];
      },

      async search(query: string, _page: number, state: FilterState): Promise<MangaPage> {
        if (query.trim()) {
          return mangaPage(withQuery(`${BASE_URL}/keywords`, { q: query, s: 'date', lang }), 'div.item-search');
        }
        // Nothing to search, filters active -> browse /genres instead.
        const genre = typeof state.genre === 'string' && state.genre ? state.genre : 'fantasy';
        const sort = typeof state.sort === 'string' ? state.sort : '';
        return mangaPage(
          withQuery(`${BASE_URL}/genres/${genre}`, { l: lang, ...(sort ? { s: sort } : {}) }),
          'div.item-recent',
        );
      },

      async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
        const document = await fetchDocument(`${BASE_URL}${manga.url}`);
        const box = document.selectFirst('.book-box');
        if (!box) throw new Error('Title not found');
        const kind = box.selectFirst('div.book-submit-type')?.text();
        return {
          url: manga.url,
          title: box.selectFirst('div.title')?.text() || manga.title,
          thumbnailUrl: box.selectFirst('div.cover img')?.attr('data-src') || manga.thumbnailUrl,
          author: box.selectFirst('div.mod-btn-profile div.name')?.text(),
          description:
            box
              .select('div.summary p')
              .map((p) => p.text())
              .join('\n\n') || undefined,
          genres: box.select('div.genre-area div.tag-genre').map((g) => g.text()),
          status: kind === 'Series' ? 'ongoing' : kind === 'One-shot' ? 'completed' : 'unknown',
        };
      },

      async getChapters(manga: MangaSummary): Promise<Chapter[]> {
        const titleId = manga.url.split('/').filter(Boolean)[1]!;
        const first = await chapterPage(titleId, 1);
        const chapters = [...first.chapters];
        let hasNext = first.hasNext;
        for (let page = 2; hasNext; page++) {
          const next = await chapterPage(titleId, page);
          if (next.chapters.length === 0) break;
          chapters.push(...next.chapters);
          hasNext = next.hasNext;
        }
        return chapters.reverse();
      },

      async getPages(chapter: Chapter): Promise<Page[]> {
        const document = await fetchDocument(`${BASE_URL}${chapter.url}`);
        const viewer = document.selectFirst('div[react=viewer]');
        if (!viewer) throw new Error('Viewer not found');
        const data = JSON.parse(viewer.attr('data-pages') ?? '{}') as { pc?: { page_no: number; image_url: string }[] };
        return (data.pc ?? []).map((p, index) => ({ index, imageUrl: p.image_url }));
      },

      imageHeaders: () => ({ 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` }),

      resolveUrl(url: string): MangaSummary | null {
        const match = /^https?:\/\/(?:www\.)?(?:mangaplus-creators\.jp|medibang\.com)\/titles\/([^/?#]+)/i.exec(
          url.trim(),
        );
        return match ? { url: relativeUrl(`/titles/${match[1]}`), title: '' } : null;
      },

      getWebUrl: (item) => `${BASE_URL}${item.url}`,
    };
  },
});
