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
import { USER_AGENT, findRscObject, hostOf, relativeDate, withQuery } from './common/utils';

const BASE_URL = 'https://silentquill.net';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const GENRES = [
  { label: 'All', value: '' },
  { label: 'Comedy', value: 'comedy' },
  { label: 'Fantasy', value: 'fantasy' },
  { label: 'Romance', value: 'romance' },
  { label: 'School Life', value: 'school-life' },
  { label: 'Shounen', value: 'shounen' },
  { label: 'Harem', value: 'harem' },
  { label: 'Ecchi', value: 'ecchi' },
  { label: 'Action', value: 'action' },
  { label: 'Seinen', value: 'seinen' },
  { label: 'Adventure', value: 'adventure' },
  { label: 'Drama', value: 'drama' },
  { label: 'Completed', value: 'completed' },
  { label: 'Adult', value: 'adult' },
  { label: 'Slice of Life', value: 'slice-of-life' },
  { label: 'Erotica', value: 'erotica' },
  { label: 'isekai', value: 'isekai' },
  { label: 'Mature', value: 'mature' },
  { label: 'Supernatural', value: 'supernatural' },
  { label: 'Mystery', value: 'mystery' },
  { label: 'Psychological', value: 'psychological' },
  { label: 'Sexual Violence', value: 'sexual-violence' },
  { label: 'Demons', value: 'demons' },
  { label: 'Magic', value: 'magic' },
  { label: 'Sci-fi', value: 'sci-fi' },
  { label: 'Adaptation', value: 'adaptation' },
  { label: 'Gender Bender', value: 'gender-bender' },
  { label: 'Gyaru', value: 'gyaru' },
  { label: 'Monsters', value: 'monsters' },
  { label: 'Reincarnation', value: 'reincarnation' },
  { label: 'Sports', value: 'sports' },
  { label: 'Tragedy', value: 'tragedy' },
  { label: 'Web Comic', value: 'web-comic' },
  { label: 'Ghosts', value: 'ghosts' },
  { label: 'Gore', value: 'gore' },
  { label: 'Horror', value: 'horror' },
  { label: 'Josei', value: 'josei' },
  { label: 'Monster Girls', value: 'monster-girls' },
  { label: 'One-shot', value: 'one-shot' },
  { label: 'Shoujo', value: 'shoujo' },
  { label: 'Survival', value: 'survival' },
  { label: 'Zombies', value: 'zombies' },
  { label: 'Aliens', value: 'aliens' },
  { label: 'Delinquents', value: 'delinquents' },
  { label: 'Full Color', value: 'full-color' },
  { label: 'Genderswap', value: 'genderswap' },
  { label: "Girls' Love", value: 'girls-love' },
  { label: 'Hentai', value: 'hentai' },
  { label: 'Historical', value: 'historical' },
  { label: 'Martial Arts', value: 'martial-arts' },
  { label: 'Mecha', value: 'mecha' },
  { label: 'Myster', value: 'myster' },
  { label: 'Smut', value: 'smut' },
  { label: 'Suggestive', value: 'suggestive' },
  { label: 'Thriller', value: 'thriller' },
  { label: 'Video Games', value: 'video-games' },
];

async function load(url: string): Promise<{ body: string; document: HtmlElement }> {
  const body = (await http.get(url.startsWith('http') ? url : `${BASE_URL}${url}`, { headers })).body;
  return { body, document: html.load(body, { baseUrl: BASE_URL }) };
}

// Series cards: links to "/series/<slug>/" around an image whose alt is the title.
function cards(document: HtmlElement, scope: string): MangaSummary[] {
  const seen = new Set<string>();
  return document.select(`${scope} a[href^="/series/"]:has(img[alt])`).flatMap((a): MangaSummary[] => {
    const slug = (a.attr('href') ?? '').split('/')[2];
    const img = a.selectFirst('img[alt]');
    if (!slug || !img || seen.has(slug)) return [];
    seen.add(slug);
    return [{ url: `/series/${slug}/`, title: img.attr('alt') ?? '', thumbnailUrl: img.absUrl('src') || undefined }];
  });
}

async function search(page: number, query: string, filters: FilterState): Promise<MangaPage> {
  const text = (id: string) => (typeof filters[id] === 'string' && filters[id] ? (filters[id] as string) : undefined);
  const { document } = await load(
    withQuery(`${BASE_URL}/search/`, {
      status: text('status'),
      genre: text('genre'),
      q: query.trim(),
      page: String(page),
    }),
  );
  return { items: cards(document, 'body'), hasNextPage: document.selectFirst(`a[href*="page=${page + 1}"]`) != null };
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const { document } = await load('/');
      return { items: cards(document, '.grid-cols-4'), hasNextPage: false };
    },
    getLatest: (page) => search(page, '', {}),
    search: (query, page, filters) => search(page, query, filters),
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [
          { label: 'All', value: '' },
          { label: 'Ongoing', value: 'ongoing' },
          { label: 'Completed', value: 'completed' },
        ],
      },
      { type: 'select', id: 'genre', label: 'Genres', options: GENRES },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await load(manga.url);
      const byline = document.selectFirst('p.mt-2.text-sm.text-ink-dim')?.text();
      const status = document.select('dt').find((dt) => dt.text().trim() === 'Status');
      const statusText = status
        ? (document.select('dt + dd')[document.select('dt').indexOf(status)]?.text().toLowerCase() ?? '')
        : '';
      return {
        url: manga.url,
        title: document.selectFirst('h1')?.text() || manga.title,
        author: byline?.split(' · art by ')[0],
        artist: byline?.split(' · art by ')[1] || undefined,
        description: document.selectFirst('div.reader-content')?.text() || undefined,
        genres: document.select('a[href^="/search/?genre="]').map((a) => a.text()),
        status: statusText === 'ongoing' ? 'ongoing' : statusText === 'completed' ? 'completed' : 'unknown',
        thumbnailUrl: document.selectFirst('main img[src^="/img/"]')?.absUrl('src') || manga.thumbnailUrl,
      };
    },
    // The chapter list is a JSON array in the page's Next.js data.
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { body } = await load(manga.url);
      const text = body.replace(/\\"/g, '"');
      const seen = new Set<number>();
      const chapters: Chapter[] = [];
      for (const m of text.matchAll(
        /\{"id":(\d+),"slug":"([^"]*)","chapter_no":"([^"]*)"[^}]*?"time_ago":"([^"]*)"/g,
      )) {
        const id = Number(m[1]);
        if (seen.has(id)) continue;
        seen.add(id);
        chapters.push({
          url: `${manga.url}${m[2]}/`,
          name: `Chapter ${m[3]}`,
          number: Number(/^\d+(?:\.\d+)?/.exec(m[3]!)?.[0]) || undefined,
          uploadedAt: relativeDate(m[4]),
        });
      }
      return chapters.sort((a, b) => (b.number ?? -1) - (a.number ?? -1));
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const body = (await http.get(`${BASE_URL}${chapter.url}`, { headers: { ...headers, rsc: '1' } })).body;
      const viewer = findRscObject<{ pages: { url: string }[] }>(body, (v) => Array.isArray(v.pages));
      return (viewer?.pages ?? []).map((p, index) => ({ index, imageUrl: `${BASE_URL}${p.url}` }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/series\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase() === hostOf(BASE_URL) ? { url: `/series/${match[2]}/`, title: '' } : null;
    },
    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
