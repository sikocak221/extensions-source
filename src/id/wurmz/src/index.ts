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
import { USER_AGENT, hostOf, relativeUrl, selectFirstIgnoreCase, withQuery } from './common/utils';

const BASE_URL = 'https://wurmz.net';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

// A Next.js site. Manga urls are "/detail/<type>/<slug>", chapter urls ".../chapter/<label>". The pages
// carry what is needed in plain html: a schema.org ComicSeries block and the React payload (escaped JSON).

async function fetchPage(url: string): Promise<{ body: string; document: HtmlElement }> {
  const response = await http.get(url, { headers });
  return { body: response.body, document: html.load(response.body, { baseUrl: response.url }) };
}

async function mangaList(url: string): Promise<MangaPage> {
  const { document } = await fetchPage(url);
  const items = document.select('article.comic-card').flatMap((card): MangaSummary[] => {
    const link = card.selectFirst('a[href*="/detail/"]');
    const title = card.selectFirst('h2')?.text() || link?.attr('aria-label');
    if (!link || !title) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title,
        thumbnailUrl: card.selectFirst('img')?.absUrl('src') || undefined,
      },
    ];
  });
  return { items, hasNextPage: selectFirstIgnoreCase(document, 'a:contains(Berikutnya)') != null };
}

/** Unescapes a JSON fragment taken from the React payload (\" → "). */
function payloadJson<T>(body: string, pattern: RegExp): T | undefined {
  const match = pattern.exec(body)?.[1];
  if (!match) return undefined;
  try {
    return JSON.parse(JSON.parse(`"${match}"`) as string) as T;
  } catch {
    return undefined;
  }
}

const STATUSES: Record<string, MangaStatus> = {
  ongoing: 'ongoing',
  tamat: 'completed',
  completed: 'completed',
  hiatus: 'hiatus',
  drop: 'cancelled',
};
const option = (label: string, value: string) => ({ label, value });
const GENRES = ["18+","4-Koma","Action","Adaptation","Adventure","Age Gap","Aliens","Animals","Anthology","BDSM","Beasts","Bloody","Bodyswap","Boys","Cheating","Childhood Friends","College Life","Comedy","Cooking","Crime","Crossdressing","Cunnilingus","Delinguents","Dementia","Demons","Doujinshi","Drama","Dungeons","Ecchi","Fantasy","Femdom","Fetish","Game","Gender Bender","Ghosts","Girls","Gore","Guideverse","Gyaru","Harem","Hentai","Historical","Horror","Incest","Infidelity","Isekai","Josei","Kids","Lolicon","Mafia","Magic","Martial Art","Mature","Mecha","Medical","Milf","Military","Monsters","Music","Mystery","NTR","Nakadashi","Ninja","Non-human","Office Workers","Omegaverse","One Shot","Parodi","Philosophical","Police","Post-Apocalyptic","Project","Psychological","Regression","Reincarnation","Revenge","Reverse Harem","Reverse Isekai","Romance","Royal Family","Royalty","Samurai","School","Sci-fi","Seinen","Shotacon","Shoujo","Shoujo Ai","Shounen","Shounen Ai","Showbiz","Slice of Life","Sport","Super Power","Supernatural","Survival","System","Thriller","Time Travel","Tragedy","Transmigration","Vampire","Villain","Villainess","Violence","Virtual Reality","Webtoons","Yakuzas","Yaoi","Yuri","Zombies",]; // prettier-ignore

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    getPopular: (page) => mangaList(`${BASE_URL}/semua-komik?sort=popular_all&page=${page}`),

    getLatest: (page) => mangaList(`${BASE_URL}/semua-komik?sort=update&page=${page}`),

    search(query: string, page: number, state: FilterState): Promise<MangaPage> {
      const text = (id: string) => (typeof state[id] === 'string' && state[id] ? (state[id] as string) : undefined);
      return mangaList(
        withQuery(`${BASE_URL}/semua-komik`, {
          q: query.trim() || undefined,
          page: page > 1 ? String(page) : undefined,
          sort: text('sort') ?? 'update',
          type: text('type'),
          status: text('status'),
          genre: text('genre'),
        }),
      );
    },

    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'sort',
        label: 'Urutkan',
        options: [
          option('Update Terbaru', 'update'),
          option('Komik Baru', 'new'),
          option('Terlama', 'old'),
          option('Populer Hari Ini', 'popular_today'),
          option('Populer 3 Hari', 'popular_3d'),
          option('Populer 7 Hari', 'popular_7d'),
          option('Populer 1 Bulan', 'popular_30d'),
          option('Populer Sepanjang Masa', 'popular_all'),
        ],
      },
      {
        type: 'select',
        id: 'type',
        label: 'Tipe',
        options: [option('Semua Tipe', ''), ...['Manga', 'Manhwa', 'Manhua'].map((t) => option(t, t.toLowerCase()))],
      },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [
          option('Semua Status', ''),
          option('Ongoing', 'ongoing'),
          option('Tamat', 'tamat'),
          option('Hiatus', 'hiatus'),
          option('Drop', 'drop'),
        ],
      },
      {
        type: 'select',
        id: 'genre',
        label: 'Genre',
        options: [option('Semua Genre', ''), ...GENRES.map((g) => option(g, g))],
      },
    ],

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const { document } = await fetchPage(`${BASE_URL}${manga.url}`);
      const series = document
        .select('script[type="application/ld+json"]')
        .map((script) => {
          try {
            return JSON.parse(script.html()) as Record<string, unknown>;
          } catch {
            return {};
          }
        })
        .find((data) => data['@type'] === 'ComicSeries') as
        | {
            name?: string;
            alternateName?: string;
            description?: string;
            image?: string;
            author?: { name?: string };
            genre?: string[];
          }
        | undefined;
      let description = series?.description ?? '';
      if (series?.alternateName?.trim())
        description += `${description ? '\n\n' : ''}Nama Alternatif: ${series.alternateName}`;
      const status = document.selectFirst('.status-badge')?.text().toLowerCase() ?? '';
      const type = manga.url.split('/')[2] ?? '';
      return {
        url: manga.url,
        title: series?.name || manga.title,
        description: description || undefined,
        thumbnailUrl: series?.image || manga.thumbnailUrl,
        author: series?.author?.name || undefined,
        genres: series?.genre,
        status: STATUSES[status] ?? 'unknown',
        type: type === 'manhwa' || type === 'manhua' || type === 'manga' ? type : undefined,
      };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const { body } = await fetchPage(`${BASE_URL}${manga.url}`);
      const chapters = payloadJson<{ chapter_label: string; chapter_sort: number }[]>(
        body,
        /\\"chapters\\":(\[(?:\{\\"chapter_label[^\]]*)?\])/,
      );
      if (!chapters) throw new Error('Gagal memproses daftar chapter');
      const source =
        payloadJson<string>(body, /\\"sourceSlug\\":(\\"[^\\]+\\")/) ?? manga.url.replace(/^\/detail\//, '');
      return chapters.map((c) => ({
        url: `/detail/${source}/chapter/${c.chapter_label}`,
        name: `Chapter ${c.chapter_label}`,
        number: c.chapter_sort,
      }));
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const { body } = await fetchPage(`${BASE_URL}${chapter.url}`);
      const images = payloadJson<string[]>(body, /\\"images\\":(\[[^\]]*\])/);
      if (!images) throw new Error('Gagal memproses daftar gambar');
      return images.map((imageUrl, index) => ({ index, imageUrl }));
    },

    imageHeaders: () => headers,

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/(?:[^?#]*\/)?detail\/([^/?#]+)\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]?.toLowerCase().replace(/^www\./, '') === hostOf(BASE_URL)
        ? { url: `/detail/${match[2]}/${match[3]}`, title: '' }
        : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
