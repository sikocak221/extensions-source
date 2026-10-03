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
import { USER_AGENT, absoluteUrl, hostOf, parseDate, selectIgnoreCase, withQuery } from './common/utils';

const BASE_URL = 'https://kuramanga.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const PAGE_SIZE = 18;
const STATUSES = ['All', 'Ongoing', 'Completed', 'Hiatus', 'On Hold', 'Canceled'];
const GENRES: string[] = [
  '+100 Chapter',
  'Ability',
  'Academy',
  'Acting',
  'Action',
  'Adaptation',
  'Adult',
  'Adventure',
  'Ai',
  'Aliens',
  'Animals',
  'Anthology',
  'Apocalypse',
  'Award Winning',
  'Battleofintellect',
  'BDSM',
  'BL',
  'Borderline H',
  'Boys Love',
  'Bullying',
  'Campus',
  'Cheating/infidelity',
  'Cohabitation',
  'College',
  'College life',
  'Comedy',
  'Comic',
  'Cooking',
  'Crazy MC',
  'Crime',
  'Crossdressing',
  'Cultivation',
  'Curse',
  'Dark Fantasy',
  'Darkfantasy',
  'Delinquents',
  'Demon',
  'Demons',
  'Difference in Status',
  'Doujinshi',
  'Drama',
  'Dungeons',
  'Ecchi',
  'Elementals',
  'Elf',
  'Explicit Sex',
  'Family',
  'Fantasia',
  'Fantasy',
  'Fight',
  'Folklore',
  'Friday Webtoons',
  'Full Color',
  'Game',
  'Gamelit',
  'Gang',
  'Gender Bender',
  'Genderswap',
  'Genius',
  'Genius MC',
  'Ghosts',
  'Girls Love',
  'GL',
  'Gore',
  'Growth',
  'Guideverse',
  'Hardcore',
  'Harem',
  'Hentai',
  'Hidden',
  'Historical',
  'Horror',
  'Humiliation',
  'Hunter',
  'Hunters',
  'Hypnosis',
  'Idols',
  'Illusion',
  'Incest',
  'Isekai',
  'Josei',
  'Legendary',
  'Live',
  'Long Strip',
  'Love Triangle',
  'Mafia',
  'Magic',
  'Magical',
  'Manhua',
  'Manhwa',
  'Married Woman',
  'Martial Arts',
  'Mature',
  'Mecha',
  'Medical',
  'Milf',
  'Military',
  'Modernfantasy',
  'Money',
  'Monster Girls',
  'Monsters',
  'Mother',
  'Mother and Daughter',
  'Murim',
  'Music',
  'Mystery',
  'Myth',
  'Necromancer',
  'Netori',
  'Nonhumanbeings',
  'Novel Adaptation',
  'Ntl',
  'NTR',
  'Office',
  'Office Workers',
  'Omegaverse',
  'One shot',
  'Original Novel',
  'Overpowered',
  'Overpoweredmc',
  'Philosophical',
  'Politics',
  'Post-Apocalyptic',
  'Psychological',
  'Raw',
  'Reborn',
  'Regression',
  'Reincarnation',
  'Returner',
  'Revenge',
  'Reverse Harem',
  'Robots',
  'Romance',
  'Royal family',
  'School',
  'School Life',
  'Schoollife',
  'Sci-Fi',
  'Seinen',
  'Serial',
  'Short Story',
  'Shoujo',
  'Shounen',
  'Shounen Ai',
  'Showbiz',
  'Sisters',
  'Slice of Life',
  'Sm',
  'Smut',
  'Sport',
  'Sports',
  'Stepmother',
  'Superhero',
  'Supernatural',
  'Superpower',
  'Survival',
  'Swapping',
  'Swordsman',
  'System',
  'Teacher',
  'Threesome',
  'Thriller',
  'Time Travel',
  'Tower',
  'Traditional Games',
  'Tragedy',
  'Training',
  'Transmigration',
  'Uncensored',
  'Urban',
  'Vampires',
  'Video Games',
  'Villain',
  'Villainess',
  'Violence',
  'Virtual Reality',
  'Visualshock',
  'Web Comic',
  'Webtoon',
  'Webtoons',
  'Wholesome',
  'Workplace',
  'Wuxia',
  'Xuanhuan',
  'Yaoi',
  'Yuri',
  'Zombies',
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const path = (href?: string) => `/${(href ?? '').replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '')}`;

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(): Promise<MangaPage> {
      const items = (await load('/'))
        .select('section:has(h2:contains(Popular)) a.sp-card')
        .flatMap((a): MangaSummary[] => {
          const title = a.selectFirst('.sp-cap h3')?.text();
          return title
            ? [{ url: path(a.attr('href')), title, thumbnailUrl: a.selectFirst('img')?.absUrl('src') || undefined }]
            : [];
        });
      return { items, hasNextPage: false };
    },
    async getLatest(page: number): Promise<MangaPage> {
      const document = await load(page > 1 ? `/?page=${page}` : '/');
      const seen = new Set<string>();
      const items = document.select('.update-list .update-row').flatMap((row): MangaSummary[] => {
        const link = row.selectFirst('a.update-series-link');
        const url = path(link?.attr('href'));
        if (!link || seen.has(url)) return [];
        seen.add(url);
        return [{ url, title: link.text(), thumbnailUrl: row.selectFirst('img')?.absUrl('src') || undefined }];
      });
      return { items, hasNextPage: document.selectFirst('a[data-lu-next]:not(.is-disabled)') != null };
    },
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const genres = Object.entries(filters)
        .filter(([id, v]) => id.startsWith('genre.') && v === true)
        .map(([id]) => id.slice(6));
      const status = typeof filters.status === 'string' && filters.status ? filters.status : undefined;
      const url = withQuery(`${BASE_URL}/search`, {
        ajax: '1',
        page: String(page),
        name: query.trim() || undefined,
        genre: genres.join(',') || undefined,
        status,
        adult: filters.adult === false ? '0' : undefined,
      });
      const data = (
        await http.get<{
          data?: { title: string; thumb?: string | null; cover_image_url?: string | null; normalized_title: string }[];
          total?: number;
        }>(url, {
          headers: { ...headers, 'X-Requested-With': 'XMLHttpRequest' },
          responseType: 'json',
        })
      ).body;
      const list = data.data ?? [];
      return {
        items: list.map((m) => ({
          url: `/${m.normalized_title}`,
          title: m.title,
          thumbnailUrl: m.thumb || m.cover_image_url || undefined,
        })),
        hasNextPage: list.length === PAGE_SIZE && (!data.total || page * PAGE_SIZE < data.total),
      };
    },
    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: STATUSES.map((s, i) => ({ label: s, value: i ? s.replace(/ /g, '_').toLowerCase() : '' })),
      },
      { type: 'checkbox', id: 'adult', label: 'Include Adult Content', default: true },
      {
        type: 'group',
        id: 'genre',
        label: 'Genres',
        filters: GENRES.map((g) => ({ type: 'checkbox', id: `genre.${g}`, label: g })),
      },
    ],
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const cred = (label: string) =>
        selectIgnoreCase(document, `.mp-cred:has(.mp-cred-k:contains(${label})) .mp-cred-v`)[0]?.text();
      const meta = (label: string) =>
        document
          .select('.meta-grid div')
          .find((d) => d.text().includes(`${label}:`))
          ?.text()
          .split(`${label}:`)[1]
          ?.trim();
      const both = cred('Story & Art') ?? cred('Author & Artist');
      const statuses: Record<string, MangaStatus> = {
        ongoing: 'ongoing',
        upcoming: 'ongoing',
        completed: 'completed',
        on_hold: 'hiatus',
        'on hold': 'hiatus',
        hiatus: 'hiatus',
        canceled: 'cancelled',
        cancelled: 'cancelled',
      };
      return {
        url: manga.url,
        title: document.selectFirst('h1.manga-title')?.text() || manga.title,
        description: (document.selectFirst('.summary-inner') ?? document.selectFirst('.mp-synopsis'))?.text(),
        author: cred('Author') ?? cred('Story') ?? both ?? meta('Author'),
        artist: cred('Artist') ?? cred('Art') ?? both ?? meta('Artist'),
        genres: document.select('.genre-list a.genre-chip').map((a) => a.text()),
        status:
          statuses[(document.selectFirst('.mp-status')?.text() ?? meta('Status') ?? '').trim().toLowerCase()] ??
          'unknown',
        thumbnailUrl: document.selectFirst("meta[property='og:image']")?.attr('content') || manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      return (await load(manga.url)).select('.chapter-list .chapter-item').flatMap((item): Chapter[] => {
        const a = item.selectFirst('a');
        return a
          ? [
              {
                url: path(a.attr('href')),
                name: a.text(),
                uploadedAt: parseDate(item.selectFirst('time')?.text(), 'MMM d, yyyy'),
              },
            ]
          : [];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      return (await load(chapter.url))
        .select('#chapterImages img')
        .map((img, index) => ({ index, imageUrl: img.absUrl('data-src') || img.absUrl('src') || '' }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/([^/?#]+)\/?$/i.exec(url.trim());
      if (
        !match ||
        match[1]!.toLowerCase() !== hostOf(BASE_URL) ||
        ['search', 'assets', 'api', 'login', 'register'].includes(match[2]!)
      )
        return null;
      return { url: `/${match[2]}`, title: '' };
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
