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
import { USER_AGENT, hostOf, parseDate, relativeUrl, selectFirstIgnoreCase } from './common/utils';

const BASE_URL = 'https://v1.bacami.site';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const imgAttr = (img: HtmlElement | null) => img?.absUrl('data-src') || img?.absUrl('src') || undefined;
// Paths need the trailing slash: without it the site redirects to plain http.
const paged = (path: string, page: number) => `${BASE_URL}${path}/${page > 1 ? `page/${page}/` : ''}`;

function mangaList(document: HtmlElement): MangaPage {
  const items = document.select('article.genre-card').flatMap((element): MangaSummary[] => {
    const link = element.selectFirst('div.genre-cover > a');
    const title = element.selectFirst('div.genre-info > a')?.text();
    if (!link || !title) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title,
        thumbnailUrl: imgAttr(element.selectFirst('div.genre-cover > a > img')),
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('div.paginate a.next.page-numbers') != null };
}

const option = (label: string, value: string) => ({ label, value });
const GENRES = [
  ['Action', 'action-2'], ['Adult', 'adult'], ['Adventure', 'adventure'], ['Apocalypse', 'apocalypse'],
  ['Comedy', 'comedy'], ['Cooking', 'cooking'], ['Crime', 'crime'], ['Cultivation', 'cultivation'],
  ['Demons', 'demons'], ['Doujinshi', 'doujinshi'], ['Drama', 'drama'], ['Ecchi', 'ecchi'], ['Fantasy', 'fantasy'],
  ['Furry', 'furry'], ['Game', 'game'], ['Gender Bender', 'gender-bender'], ['Genius', 'genius'], ['Gore', 'gore'],
  ['Harem', 'harem'], ['Hentai', 'hentai'], ['Historical', 'historical'], ['Horror', 'horror'], ['Isekai', 'isekai'],
  ['Josei', 'josei'], ['Lolicon', 'lolicon'], ['Long Strip', 'long-strip'], ['Love Polygon', 'love-polygon'],
  ['Magic', 'magic'], ['Magical Girl', 'magical-girl'], ['Manhua', 'manhua'], ['Manhwa', 'manhwa'],
  ['Martial Art', 'martial-art'], ['Martial Arts', 'martial-arts'], ['Mature', 'mature'], ['Mecha', 'mecha'],
  ['Medical', 'medical'], ['Military', 'military'], ['Monster', 'monster'], ['Monster Girls', 'monster-girls'],
  ['Monsters', 'monsters'], ['Music', 'music'], ['Mystery', 'mystery'], ['Mythology', 'mythology'],
  ['One Shot', 'one-shot'], ['Oneshot', 'oneshot'], ['Parody', 'parody'], ['Philosophical', 'philosophical'],
  ['Police', 'police'], ['Post-Apocalyptic', 'post-apocalyptic'], ['Psychological', 'psychological'],
  ['Rebirth', 'rebirth'], ['Reincarnation', 'reincarnation'], ['Romance', 'romance'],
  ['Romantic Subtext', 'romantic-subtext'], ['Samurai', 'samurai'], ['School', 'school'],
  ['School Life', 'school-life'], ['Sci-fi', 'sci-fi'], ['Seinen', 'seinen'], ['Shotacon', 'shotacon'],
  ['Shoujo', 'shoujo'], ['Shoujo Ai', 'shoujo-ai'], ['Shounen', 'shounen'], ['Shounen Ai', 'shounen-ai'],
  ['Slice of Life', 'slice-of-life'], ['Smut', 'smut'], ['Space', 'space'], ['Sports', 'sports'],
  ['Superhero', 'superhero'], ['Supernatural', 'supernatural'], ['Super Power', 'super-power'],
  ['Survival', 'survival'], ['Suspense', 'suspense'], ['System', 'system'], ['Team Sports', 'team-sports'],
  ['Thriller', 'thriller'], ['Time Travel', 'time-travel'], ['Tragedy', 'tragedy'], ['Urban', 'urban'],
  ['Urban Fantasy', 'urban-fantasy'], ['Vampire', 'vampire'], ['Video Game', 'video-game'],
  ['Villainess', 'villainess'], ['Visual Arts', 'visual-arts'], ['Webtoon', 'webtoon'], ['Webtoons', 'webtoons'],
  ['Wuxia', 'wuxia'], ['Yaoi', 'yaoi'], ['Yuri', 'yuri'], ['Zombies', 'zombies'],
].map(([label, value]) => option(label!, value!)); // prettier-ignore

function filters(): Filter[] {
  return [
    { type: 'header', label: 'Filter diabaikan jika menggunakan pencarian teks.' },
    { type: 'separator' },
    { type: 'select', id: 'genre', label: 'Genre', options: [option('All', 'all'), ...GENRES] },
    {
      type: 'select',
      id: 'status',
      label: 'Status',
      options: [option('All', 'all'), option('Hot', 'hot'), option('Project', 'project'), option('Completed', 'tamat')],
    },
    {
      type: 'select',
      id: 'type',
      label: 'Type',
      options: [option('All', 'all'), option('Manga', 'manga'), option('Manhua', 'manhua'), option('Manhwa', 'manhwa')],
    },
    {
      type: 'select',
      id: 'orderby',
      label: 'Order By',
      options: [option('Latest Updates', 'latest'), option('Alphabetical', 'name'), option('Score', 'score')],
    },
    { type: 'separator' },
    { type: 'header', label: "Centang 'Komik Baru' akan mengabaikan filter lain." },
    { type: 'checkbox', id: 'new', label: 'Komik Baru' },
  ];
}

function parseStatus(document: HtmlElement): MangaStatus {
  if (document.selectFirst('.hot-tag, .project-tag')) return 'ongoing';
  if (document.selectFirst('.tamat-tag')) return 'completed';
  return 'unknown';
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    getPopular: async (page) => mangaList(await fetchDocument(paged('/custom-search/orderby/score', page))),

    getLatest: async (page) => mangaList(await fetchDocument(paged('/custom-search/orderby/latest', page))),

    async search(query: string, page: number, state: FilterState): Promise<MangaPage> {
      const text = (id: string, fallback: string) =>
        typeof state[id] === 'string' && state[id] ? (state[id] as string) : fallback;
      let path: string;
      if (query.trim()) path = `/search/${encodeURIComponent(query.trim())}`;
      else if (state.new === true) path = '/komik-baru';
      else {
        path = '/custom-search';
        const genre = text('genre', 'all');
        const status = text('status', 'all');
        const type = text('type', 'all');
        const orderby = text('orderby', 'latest');
        if (genre !== 'all') path += `/genre/${genre}`;
        if (status !== 'all') path += `/status/${status}`;
        if (type !== 'all') path += `/type/${type}`;
        if (orderby !== 'latest') path += `/orderby/${orderby}`;
      }
      return mangaList(await fetchDocument(paged(path, page)));
    },

    getFilters: filters,

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}`);
      const content = document.selectFirst('#komik > section.manga-content');
      if (!content) return { url: manga.url, title: manga.title, status: 'unknown' };
      const altTitle = content
        .select('p.manga-altname')
        .map((p) => p.text())
        .join(' ');
      const desc = content
        .select('p.manga-description')
        .map((p) => p.text())
        .join(' ');
      return {
        url: manga.url,
        title:
          content
            .selectFirst('header > h1')
            ?.text()
            .replace(/Bahasa Indonesia$/, '')
            .trim() || manga.title,
        thumbnailUrl: imgAttr(content.selectFirst('figure .image-wrap img')) ?? manga.thumbnailUrl,
        author:
          selectFirstIgnoreCase(content, '.info-item:contains(Author) .info-value')?.text() ||
          content.selectFirst('div > div > div:nth-child(3) > span.info-value')?.text() ||
          undefined,
        genres: content.select('nav > span > a').map((a) => a.text()),
        status: parseStatus(document),
        description: altTitle
          ? desc
            ? `${desc}\n\nAlternative Title: ${altTitle}`
            : `Alternative Title: ${altTitle}`
          : desc || undefined,
      };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}`);
      return document.select('ol.chapter-list > li').flatMap((element): Chapter[] => {
        const link = element.selectFirst('a.ch-link');
        if (!link) return [];
        const raw = link.text();
        const after = (text: string, delimiter: string) =>
          text.includes(delimiter) ? text.slice(text.indexOf(delimiter) + delimiter.length) : text;
        const name = after(after(raw, '–'), '-').trim() || raw;
        const number = Number.parseFloat(/(?:Chapter|Ch\.)\s+(\d+(?:\.\d+)?)/i.exec(name)?.[1] ?? '');
        const date = parseDate(element.selectFirst('span.ch-date')?.text(), 'd MMMM, yyyy');
        return [
          {
            url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
            name,
            number: Number.isFinite(number) ? number : undefined,
            // Dates are Asia/Jakarta (UTC+7).
            uploadedAt: date === undefined ? undefined : date - 7 * 3_600_000,
          },
        ];
      });
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const response = await http.get(`${BASE_URL}${chapter.url}`, { headers });
      const after = response.body.split('imageUrls:')[1];
      if (!after) return [];
      const json = `${after.split('],')[0]}]`;
      const urls = JSON.parse(json) as string[];
      return urls.map((imageUrl, index) => ({ index, imageUrl }));
    },

    imageHeaders: () => headers,

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)(\/komik\/[^/?#]+\/?)/i.exec(url.trim());
      return match && match[1]?.toLowerCase() === hostOf(BASE_URL) ? { url: match[2]!, title: '' } : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
