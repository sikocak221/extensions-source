import {
  type Chapter,
  type Filter,
  type FilterState,
  type HtmlElement,
  type MangaDetails,
  type MangaPage,
  type MangaSummary,
  type Page,
  type Preference,
  defineExtension,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, relativeDate, relativeUrl, withQuery } from './common/utils';

const BASE_URL = 'https://comivex.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const HIDE_STALE: Preference = {
  type: 'switch',
  key: 'pref_hide_stale_explore_entries',
  label: "Hide stuck 'Recently Updated' entries",
  description: "Skip series pinned at the top of Explore's 'Recently Updated' sort for months without new chapters.",
  default: true,
};
// Series stuck at the top of the "Updated" sort.
const STALE_IDS = new Set(['7805', '8025', '8168', '8169', '8176', '8188']);
const GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Cooking',
  'Drama',
  'Fantasy',
  'Gender bender',
  'Harem',
  'Historical',
  'Horror',
  'Isekai',
  'Josei',
  'Manga',
  'Manhua',
  'Manhwa',
  'Martial arts',
  'Mature',
  'Mecha',
  'Medical',
  'Mystery',
  'One shot',
  'Psychological',
  'Romance',
  'School life',
  'Sci fi',
  'Seinen',
  'Shoujo',
  'Shounen',
  'Slice of life',
  'Sports',
  'Supernatural',
  'Thriller',
  'Tragedy',
  'Webtoon',
  'Webtoons',
  'ladies',
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

async function explore(params: Record<string, string | undefined>): Promise<MangaPage> {
  const hideStale = prefs.get<boolean>(HIDE_STALE.key) !== false && params.sort_by === 'Updated';
  const document = await load(withQuery(`${BASE_URL}/explore/`, { ...params, ajax: '1' }));
  const items = document.select('article.manga-card').flatMap((card): MangaSummary[] => {
    const cover = card.selectFirst('a.card-cover');
    const title = card.selectFirst('.card-title a')?.text();
    const url = cover?.absUrl('href') || cover?.attr('href') || '';
    if (!cover || !title) return [];
    if (hideStale && STALE_IDS.has(/\/series\/(\d+)[-/]/.exec(url)?.[1] ?? '')) return [];
    return [{ url: relativeUrl(url), title, thumbnailUrl: card.selectFirst('img')?.absUrl('src') || undefined }];
  });
  return { items, hasNextPage: items.length > 0 };
}

export default defineExtension({
  preferences: () => [HIDE_STALE],
  createSource: () => ({
    baseUrl: BASE_URL,
    getPopular: (page) => explore({ sort_by: 'Views', results: String(page) }),
    async getLatest(): Promise<MangaPage> {
      const seen = new Set<string>();
      const items = (await load('/latest/')).select('article.u-card').flatMap((card): MangaSummary[] => {
        const link = card.selectFirst('a.u-card__title');
        const title = link?.attr('title') || link?.text();
        const url = relativeUrl(link?.absUrl('href') || link?.attr('href') || '');
        if (!link || !title || seen.has(url)) return [];
        seen.add(url);
        return [{ url, title, thumbnailUrl: card.selectFirst('img.u-card__img')?.absUrl('src') || undefined }];
      });
      return { items, hasNextPage: false };
    },
    search(query: string, page: number, filters: FilterState) {
      const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');
      return explore({
        search: query.trim() || undefined,
        genre_included: text('type') || text('genre'),
        sort_by: text('sort') || 'Views',
        status: text('status'),
        results: String(page),
      });
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'genre',
        label: 'Genre',
        options: [{ label: 'All Genres', value: '' }, ...GENRES.map((g) => ({ label: g, value: g }))],
      },
      {
        type: 'select',
        id: 'sort',
        label: 'Sort',
        options: ['Views', 'Updated', 'New', 'Random'].map((s) => ({ label: s, value: s })),
      },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: ['All', 'Ongoing', 'Completed'].map((s, i) => ({ label: s, value: i ? s : '' })),
      },
      {
        type: 'select',
        id: 'type',
        label: 'Type',
        options: ['All Types', 'Manga', 'Manhwa', 'Manhua'].map((s, i) => ({ label: s, value: i ? s : '' })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const status = document.selectFirst('.md-status')?.text().toLowerCase() ?? '';
      return {
        url: manga.url,
        title: document.selectFirst('.md-title')?.text() || manga.title,
        author: document.selectFirst('.md-author span')?.text(),
        description: document.selectFirst('#synopsis')?.text(),
        genres: document.select('.md-genres a.md-genre-pill').map((a) => a.text()),
        thumbnailUrl: document.selectFirst('.md-cover-wrap img.md-cover')?.absUrl('src') || manga.thumbnailUrl,
        status: status.includes('ongoing')
          ? 'ongoing'
          : status.includes('completed')
            ? 'completed'
            : status.includes('hiatus')
              ? 'hiatus'
              : 'unknown',
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      return (await load(manga.url)).select('.ch-list .ch-item').flatMap((item): Chapter[] => {
        const a = item.selectFirst('a.ch-link');
        return a
          ? [
              {
                url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
                name: item.selectFirst('.ch-num')?.text() ?? '',
                uploadedAt: relativeDate(item.selectFirst('.ch-date')?.text()),
              },
            ]
          : [];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      return (await load(chapter.url))
        .select('#chapter-images .page-wrapper img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('src') || img.attr('src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/series\/[^?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
