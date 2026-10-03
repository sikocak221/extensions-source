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
import { USER_AGENT, parseDate, relativeUrl, selectFirstIgnoreCase, withQuery } from './common/utils';

const BASE_URL = 'https://komiku.org';
const API_URL = 'https://api.komiku.org';

const headers = {
  'User-Agent': USER_AGENT,
  Referer: `${BASE_URL}/`,
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
};

async function fetchDocument(url: string): Promise<HtmlElement> {
  const response = await http.get(url, { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const removeQuery = (url: string | undefined) => url?.replace(/\?.*$/, '') || undefined;

function mangaList(document: HtmlElement): MangaPage {
  const items = document.select('div.bge').flatMap((element): MangaSummary[] => {
    const link = element.selectFirst('a:has(h3)');
    const title = element.selectFirst('h3')?.text();
    if (!link || !title) return [];
    return [
      {
        url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
        title,
        thumbnailUrl: removeQuery(element.selectFirst('img')?.absUrl('src')),
      },
    ];
  });
  return { items, hasNextPage: document.selectFirst('span[hx-get]') != null || items.length >= 10 };
}

const mangaApiUrl = (page: number) => `${API_URL}/manga/${page > 1 ? `page/${page}/` : ''}`;

function parseStatus(text: string | undefined): MangaStatus {
  const value = text?.toLowerCase() ?? '';
  if (value.includes('ongoing') || value.includes('on going')) return 'ongoing';
  if (value.includes('end') || value.includes('completed') || value.includes('tamat')) return 'completed';
  return 'unknown';
}

/** "3 hari lalu" → epoch ms. */
function parseRelative(text: string): number | undefined {
  const [amountText, unit] = text.split(' lalu')[0]!.trim().split(' ');
  const amount = Number.parseInt(amountText ?? '', 10);
  if (Number.isNaN(amount) || !unit) return undefined;
  const date = new Date();
  const units: Record<string, () => void> = {
    detik: () => date.setSeconds(date.getSeconds() - amount),
    menit: () => date.setMinutes(date.getMinutes() - amount),
    jam: () => date.setHours(date.getHours() - amount),
    hari: () => date.setDate(date.getDate() - amount),
    minggu: () => date.setDate(date.getDate() - amount * 7),
    bulan: () => date.setMonth(date.getMonth() - amount),
    tahun: () => date.setFullYear(date.getFullYear() - amount),
  };
  units[unit]?.();
  return date.getTime();
}

const option = (label: string, value: string) => ({ label, value });
const GENRES = [
  'academy', 'action', 'adaptation', 'adult', 'adventure', 'apocalypse', 'beasts', 'blacksmith', 'comedy', 'comic',
  'cooking', 'crime', 'crossdressing', 'dark-fantasy', 'demons', 'doujinshi', 'drama', 'ecchi', 'entertainment',
  'fantasy', 'game', 'gender-bender', 'genderswap', 'genius', 'ghosts', 'gore', 'gyaru', 'harem', 'hentai',
  'historical', 'horror', 'isekai', 'josei', 'knight', 'long-strip', 'magic', 'magical-girls', 'manga', 'mangatoon',
  'manhwa', 'martial-art', 'martial-arts', 'mature', 'mc-rebirth', 'mecha', 'medical', 'military', 'monster',
  'monster-girls', 'monsters', 'murim', 'music', 'mystery', 'office-workers', 'one-shot', 'oneshot', 'police',
  'psychological', 'regression', 'reincarnation', 'revenge', 'romance', 'school', 'school-life', 'sci-fi', 'seinen',
  'sexual-violence', 'shotacon', 'shoujo', 'shoujo-ai', 'shoujog', 'shounen', 'shounen-ai', 'slice-of-life',
  'slow-life', 'smut', 'sport', 'sports', 'strategy', 'super-power', 'supernatural', 'survival', 'sword-fight',
  'sword-master', 'swormanship', 'system', 'thriller', 'tragedy', 'trauma', 'vampire', 'villainess', 'violence',
  'web-comic', 'webtoon', 'webtoons', 'xianxia', 'xuanhuan', 'yuri',
].map((slug) => option(slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '), slug)); // prettier-ignore

function filters(): Filter[] {
  const genres = [option('Semua', ''), ...GENRES];
  return [
    {
      type: 'select',
      id: 'tipe',
      label: 'Tipe',
      options: [option('Semua', ''), option('Manga', 'manga'), option('Manhua', 'manhua'), option('Manhwa', 'manhwa')],
    },
    {
      type: 'select',
      id: 'orderby',
      label: 'Order',
      options: [
        option('Chapter Terbaru', 'modified'),
        option('Komik Terbaru', 'date'),
        option('Peringkat', 'meta_value_num'),
        option('Acak', 'rand'),
      ],
    },
    { type: 'select', id: 'genre', label: 'Genre 1', options: genres },
    { type: 'select', id: 'genre2', label: 'Genre 2', options: genres },
    {
      type: 'select',
      id: 'statusmanga',
      label: 'Status',
      options: [option('Semua', ''), option('Ongoing', 'ongoing'), option('Tamat', 'end')],
    },
  ];
}

function filterParams(state: FilterState): Record<string, string | undefined> {
  const params: Record<string, string | undefined> = {};
  for (const id of ['tipe', 'orderby', 'genre', 'genre2', 'statusmanga']) {
    const value = state[id];
    if (typeof value === 'string' && value) params[id] = value;
  }
  return params;
}

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,

    async getPopular(page: number): Promise<MangaPage> {
      return mangaList(
        await fetchDocument(`${API_URL}/other/hot/${page > 1 ? `page/${page}/` : ''}?orderby=meta_value_num`),
      );
    },

    async getLatest(page: number): Promise<MangaPage> {
      return mangaList(await fetchDocument(withQuery(mangaApiUrl(page), { orderby: 'modified' })));
    },

    async search(query: string, page: number, state: FilterState): Promise<MangaPage> {
      const url = withQuery(mangaApiUrl(page), { s: query.trim() || undefined, ...filterParams(state) });
      return mangaList(await fetchDocument(url));
    },

    getFilters: filters,

    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await fetchDocument(`${BASE_URL}${manga.url}`);
      let description = document
        .select('#Sinopsis > p, p.desc[itemprop=description]')
        .map((p) => p.text())
        .join(' ');
      const alternative = selectFirstIgnoreCase(
        document,
        'table.inftable tr:contains(Judul Indonesia) td + td, table.inftable tr:contains(Judul Alternatif) td + td',
      )?.text();
      if (alternative) description += `${description ? '\n\n' : ''}Judul Alternatif: ${alternative}`;
      const type =
        selectFirstIgnoreCase(document, 'table.inftable tr > td:contains(Jenis Komik) + td')?.text().toLowerCase() ??
        '';
      return {
        url: manga.url,
        title:
          document
            .selectFirst('#Judul h1, h1 span[itemprop=name]')
            ?.text()
            .replace(/^Komik\s+/i, '') || manga.title,
        description: description || undefined,
        author:
          selectFirstIgnoreCase(
            document,
            'table.inftable td:contains(Pengarang)+td, table.inftable td:contains(Komikus)+td, table.inftable td:contains(Author)+td',
          )?.text() || undefined,
        genres: document.select('ul.genre li.genre a span').map((s) => s.text()),
        status: parseStatus(selectFirstIgnoreCase(document, 'table.inftable tr > td:contains(Status) + td')?.text()),
        thumbnailUrl:
          removeQuery(document.selectFirst('div.ims > img, img[itemprop=image]')?.absUrl('src')) ?? manga.thumbnailUrl,
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
      // Long chapter tables: yield now and then (the sandbox allows 2 s without yielding).
      await timers.sleep(0);
      const rows = document.select('#Daftar_Chapter tr:has(td.judulseries)');
      const chapters: Chapter[] = [];
      for (let i = 0; i < rows.length; i++) {
        if (i % 300 === 0) await timers.sleep(0);
        const link = rows[i]!.selectFirst('a');
        if (!link) continue;
        const date = rows[i]!.selectFirst('td.tanggalseries')?.text() ?? '';
        // Dates are Asia/Jakarta (UTC+7).
        const absolute = parseDate(date, 'dd/MM/yyyy');
        chapters.push({
          url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
          name: link.text(),
          uploadedAt: date.includes('lalu')
            ? parseRelative(date)
            : absolute === undefined
              ? undefined
              : absolute - 7 * 3_600_000,
        });
      }
      return chapters;
    },

    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await fetchDocument(`${BASE_URL}${chapter.url}`);
      return document
        .select('#Baca_Komik img')
        .filter((img) => !(img.attr('src') ?? '').includes('komiku-promosi'))
        .map((img) => img.absUrl('src') || img.attr('src') || '')
        .filter(Boolean)
        .map((imageUrl, index) => ({ index, imageUrl }));
    },

    imageHeaders: () => ({
      ...headers,
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Sec-Fetch-Dest': 'image',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'same-site',
    }),

    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/(?:www\.)?komiku\.org\/manga\/([^/?#]+)/i.exec(url.trim());
      return match ? { url: `/manga/${match[1]}/`, title: '' } : null;
    },

    getWebUrl: (item) => `${BASE_URL}${item.url}`,
  }),
});
