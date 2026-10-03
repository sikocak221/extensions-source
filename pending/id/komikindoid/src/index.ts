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
import { USER_AGENT, hostOf, imgAttr, parseDate, relativeUrl, selectFirstIgnoreCase, withQuery } from './common/utils';

const BASE_URL = 'https://komikindo.ch';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const listUrl = (page: number) => `${BASE_URL}/daftar-manga/${page > 1 ? `page/${page}/` : ''}`;

function mangaList(document: HtmlElement): MangaPage {
  const items = document.select('div.animepost').flatMap((element): MangaSummary[] => {
    const link = element.selectFirst('div.animposx > a');
    if (!link) return [];
    const title = element.selectFirst('div.tt h3')?.text() || (link.attr('title') ?? '').replace(/^Komik/, '').trim();
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title,
        thumbnailUrl: imgAttr(element.selectFirst('div.limit img'), ['data-lazy-src', 'data-src', 'src']) || undefined,
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('a.next.page-numbers') != null };
}

function parseStatus(text: string | undefined): MangaStatus {
  const value = text?.toLowerCase() ?? '';
  if (value.includes('berjalan') || value.includes('ongoing')) return 'ongoing';
  if (value.includes('tamat') || value.includes('completed')) return 'completed';
  return 'unknown';
}

function parseChapterDate(text: string): number | undefined {
  if (!text.includes('yang lalu')) {
    const time = parseDate(text, 'MMM d, yyyy');
    return time === undefined ? undefined : time - 7 * 3_600_000; // Asia/Jakarta
  }
  const amount = Number.parseInt(text.split(' ')[0] ?? '', 10);
  if (Number.isNaN(amount)) return undefined;
  const date = new Date();
  if (text.includes('detik')) date.setSeconds(date.getSeconds() - amount);
  else if (text.includes('menit')) date.setMinutes(date.getMinutes() - amount);
  else if (text.includes('jam')) date.setHours(date.getHours() - amount);
  else if (text.includes('hari')) date.setDate(date.getDate() - amount);
  else if (text.includes('minggu')) date.setDate(date.getDate() - amount * 7);
  else if (text.includes('bulan')) date.setMonth(date.getMonth() - amount);
  else if (text.includes('tahun')) date.setFullYear(date.getFullYear() - amount);
  else return undefined;
  return date.getTime();
}

const option = (label: string, value: string) => ({ label, value });
const group = (id: string, label: string, options: [string, string][]): Filter => ({
  type: 'group',
  id,
  label,
  filters: options.map(([l, v]) => ({ type: 'checkbox', id: `${id}.${v}`, label: l })),
});
// Filter group id → query parameter.
const GROUPS: Record<string, string> = {
  type: 'type[]',
  format: 'format[]',
  demografis: 'demografis[]',
  status: 'status[]',
  konten: 'konten[]',
  tema: 'tema[]',
  genre: 'genre[]',
};
const THEMES: [string, string][] = [
  ['Alien', 'aliens'], ['Animal', 'animals'], ['Cooking', 'cooking'], ['Crossdressing', 'crossdressing'],
  ['Delinquent', 'delinquents'], ['Demon', 'demons'], ['Ecchi', 'ecchi'], ['Gal', 'gyaru'], ['Genderswap', 'genderswap'],
  ['Ghost', 'ghosts'], ['Harem', 'harem'], ['Incest', 'incest'], ['Loli', 'loli'], ['Mafia', 'mafia'], ['Magic', 'magic'],
  ['Martial Arts', 'martial-arts'], ['Military', 'military'], ['Monster Girls', 'monster-girls'], ['Monsters', 'monsters'],
  ['Music', 'music'], ['Ninja', 'ninja'], ['Office Workers', 'office-workers'], ['Police', 'police'],
  ['Post-Apocalyptic', 'post-apocalyptic'], ['Reincarnation', 'reincarnation'], ['Reverse Harem', 'reverse-harem'],
  ['Samurai', 'samurai'], ['School Life', 'school-life'], ['Shota', 'shota'], ['Smut', 'smut'],
  ['Supernatural', 'supernatural'], ['Survival', 'survival'], ['Time Travel', 'time-travel'],
  ['Traditional Games', 'traditional-games'], ['Vampires', 'vampires'], ['Video Games', 'video-games'],
  ['Villainess', 'villainess'], ['Virtual Reality', 'virtual-reality'], ['Zombies', 'zombies'],
]; // prettier-ignore
const GENRES: [string, string][] = [
  ['Action', 'action'], ['Adventure', 'adventure'], ['Comedy', 'comedy'], ['Crime', 'crime'], ['Drama', 'drama'],
  ['Fantasy', 'fantasy'], ['Girls Love', 'girls-love'], ['Harem', 'harem'], ['Historical', 'historical'],
  ['Horror', 'horror'], ['Isekai', 'isekai'], ['Magical Girls', 'magical-girls'], ['Mecha', 'mecha'],
  ['Medical', 'medical'], ['Philosophical', 'philosophical'], ['Psychological', 'psychological'], ['Romance', 'romance'],
  ['Sci-Fi', 'sci-fi'], ['Shoujo Ai', 'shoujo-ai'], ['Shounen Ai', 'shounen-ai'], ['Slice of Life', 'slice-of-life'],
  ['Sports', 'sports'], ['Superhero', 'superhero'], ['Thriller', 'thriller'], ['Tragedy', 'tragedy'], ['Wuxia', 'wuxia'],
  ['Yuri', 'yuri'],
]; // prettier-ignore

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    getPopular: async (page) => mangaList(await fetchDocument(`${listUrl(page)}?order=popular`)),

    getLatest: async (page) => mangaList(await fetchDocument(`${listUrl(page)}?order=update`)),

    async search(query: string, page: number, state: FilterState): Promise<MangaPage> {
      const text = (id: string) => (typeof state[id] === 'string' ? (state[id] as string).trim() : '');
      let url = withQuery(listUrl(page), {
        title: query.trim() || undefined,
        author: text('author') || undefined,
        yearx: text('year') || undefined,
        order: text('order') || 'title',
      });
      for (const [id, value] of Object.entries(state)) {
        const [groupId, ...rest] = id.split('.');
        const param = GROUPS[groupId ?? ''];
        if (param && value === true && rest.length > 0)
          url += `&${encodeURIComponent(param)}=${encodeURIComponent(rest.join('.'))}`;
      }
      return mangaList(await fetchDocument(url));
    },

    getFilters: (): Filter[] => [
      {
        type: 'select',
        id: 'order',
        label: 'Sort By',
        options: [
          option('A-Z', 'title'),
          option('Z-A', 'titlereverse'),
          option('Latest Update', 'update'),
          option('Latest Added', 'latest'),
          option('Popular', 'popular'),
        ],
      },
      { type: 'header', label: 'NOTE: Ignored if using text search!' },
      { type: 'text', id: 'author', label: 'Author' },
      { type: 'text', id: 'year', label: 'Year' },
      { type: 'separator' },
      group('type', 'Original language', [
        ['Japanese (Manga)', 'Manga'],
        ['Chinese (Manhua)', 'Manhua'],
        ['Korean (Manhwa)', 'Manhwa'],
      ]),
      group('format', 'Format', [
        ['Black & White', '0'],
        ['Full Color', '1'],
      ]),
      group('demografis', 'Publication Demographic', [
        ['Josei', 'josei'],
        ['Seinen', 'seinen'],
        ['Shoujo', 'shoujo'],
        ['Shounen', 'shounen'],
      ]),
      group('status', 'Status', [
        ['Ongoing', 'Ongoing'],
        ['Completed', 'Completed'],
      ]),
      group('konten', 'Content Rating', [
        ['Ecchi', 'ecchi'],
        ['Gore', 'gore'],
        ['Sexual Violence', 'sexual-violence'],
        ['Smut', 'smut'],
      ]),
      group('tema', 'Story Theme', THEMES),
      group('genre', 'Genre', GENRES),
    ],

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}`);
      const info = document.selectFirst('div.infoanime');
      const labelled = (label: string) => {
        const span = selectFirstIgnoreCase(document, `.infox .spe span:contains(${label})`)?.text();
        const bold = selectFirstIgnoreCase(document, `.infox .spe b:contains(${label})`)?.text() ?? '';
        return span ? span.slice(span.indexOf(bold) + bold.length).trim() || undefined : undefined;
      };
      const mainDesc = document
        .select('div.desc > .entry-content.entry-content-single p')
        .map((p) => p.text())
        .join(' ');
      const story = mainDesc.includes('bercerita tentang ')
        ? mainDesc.slice(mainDesc.indexOf('bercerita tentang ') + 18)
        : mainDesc;
      const altName = document.selectFirst('.infox > .spe > span:nth-child(1)')?.text();
      const type =
        selectFirstIgnoreCase(document, '.infox .spe span:contains(Jenis Komik:) a')?.text().toLowerCase() ?? '';
      return {
        url: manga.url,
        title:
          manga.title ||
          document
            .selectFirst('h1.entry-title')
            ?.text()
            .replace(/^Komik/, '')
            .trim() ||
          '',
        author: labelled('Pengarang'),
        artist: labelled('Ilustrator'),
        genres: info
          ? [
              ...info.select('.infox .genre-info a'),
              ...['Grafis:', 'Tema:', 'Konten:', 'Jenis Komik:'].flatMap((label) =>
                info.select(`.infox .spe span:contains(${label}) a`),
              ),
            ].map((a) => a.text())
          : [],
        status: parseStatus(info?.selectFirst('.infox > .spe > span:nth-child(2)')?.text()),
        description: [story, altName].filter(Boolean).join('\n\n') || undefined,
        thumbnailUrl:
          imgAttr(document.selectFirst('.thumb > img:nth-child(1), .thumb img'), [
            'data-lazy-src',
            'data-src',
            'src',
          ]).replace(/\?[^?]*$/, '') || manga.thumbnailUrl,
        type: type.includes('manhwa')
          ? 'manhwa'
          : type.includes('manhua')
            ? 'manhua'
            : type.includes('manga')
              ? 'manga'
              : undefined,
      };
    },

    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}`);
      return document.select('#chapter_list li').flatMap((element): Chapter[] => {
        const link = element.selectFirst('.lchx a');
        if (!link) return [];
        const name = link.text();
        const number = Number.parseFloat(/Chapter\s+(\d+(?:\.\d+)?)/i.exec(name)?.[1] ?? '');
        const date = element.selectFirst('.dt a')?.text();
        return [
          {
            url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
            name,
            number: Number.isFinite(number) ? number : undefined,
            uploadedAt: date ? parseChapterDate(date) : undefined,
          },
        ];
      });
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await fetchDocument(`${BASE_URL}${chapter.url}`);
      return document
        .select('div.img-landmine img')
        .map((img) => {
          const onerror = img.attr('onError') ?? img.attr('onerror') ?? '';
          if (onerror.includes("src='")) return onerror.split("src='")[1]!.split("';")[0]!;
          return imgAttr(img, ['data-lazy-src', 'data-src', 'src']);
        })
        .filter(Boolean)
        .map((imageUrl, index) => ({ index, imageUrl }));
    },

    imageHeaders: () => headers,

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/komik\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]?.toLowerCase() === hostOf(BASE_URL) ? { url: `/komik/${match[2]}/`, title: '' } : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
