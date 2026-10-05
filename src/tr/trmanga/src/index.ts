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
import { USER_AGENT, absoluteUrl, hostOf, ownText, parseDate, relativeUrl } from './common/utils';

const BASE_URL = 'https://trmanga.com';
const headers = { 'User-Agent': USER_AGENT, Referer: `${BASE_URL}/` };
const CARDS = '.wl-grid > a.wl-card, .tur-grid > a.tur-card';
const NEXT = 'a[aria-label=Sonraki], a[rel=next], a.page-link:contains(Sonraki)';

// Select filters: sort, order, status, genre (ids match the query parameters of /webtoon-listesi).
const FILTERS: Filter[] = [
  {
    type: 'select',
    id: 'sort',
    label: 'Sort',
    options: [
      { label: 'Popularity', value: 'views' },
      { label: 'Rating', value: 'rating' },
      { label: 'Date Updated', value: 'updated' },
      { label: 'Date Released', value: 'released' },
      { label: 'Alphabetical Order', value: 'name' },
    ],
  },
  {
    type: 'select',
    id: 'order',
    label: 'Order',
    options: [
      { label: 'Descending', value: 'DESC' },
      { label: 'Ascending', value: 'ASC' },
    ],
  },
  {
    type: 'select',
    id: 'status',
    label: 'Status',
    options: [
      { label: 'All', value: '' },
      { label: 'Ongoing', value: 'continues' },
      { label: 'Completed', value: 'complated' },
      { label: 'Up to date', value: 'uptodate' },
    ],
  },
  {
    type: 'select',
    id: 'genre',
    label: 'Genre',
    options: [
      { label: 'All', value: '' },
      { label: 'Aksiyon', value: 'aksiyon' },
      { label: 'Bilim Kurgu', value: 'bilim-kurgu' },
      { label: 'BL', value: 'bl' },
      { label: 'Büyü', value: 'buyu' },
      { label: 'Doğaüstü', value: 'dogaustu' },
      { label: 'Dövüş Sanatları', value: 'dovus-sanatlari' },
      { label: 'Dram', value: 'dram' },
      { label: 'Fantastik', value: 'fantastik' },
      { label: 'Gerilim', value: 'gerilim' },
      { label: 'Gizem', value: 'gizem' },
      { label: 'GL', value: 'gl' },
      { label: 'Harem', value: 'harem' },
      { label: 'İsekai', value: 'isekai' },
      { label: 'Josei', value: 'josei' },
      { label: 'Komedi', value: 'komedi' },
      { label: 'Korku', value: 'korku' },
      { label: 'Macera', value: 'macera' },
      { label: 'Manga', value: 'manga' },
      { label: 'Okul', value: 'okul' },
      { label: 'One-shot', value: 'one-shot' },
      { label: 'Oyun', value: 'oyun' },
      { label: 'Psikolojik', value: 'pskolojik' },
      { label: 'Reenkarnasyon', value: 'reenkarnasyon' },
      { label: 'Romantik', value: 'romantik' },
      { label: 'Seinen', value: 'seinen' },
      { label: 'Shoujo', value: 'shoujo' },
      { label: 'Shoujo Ai', value: 'shoujo-ai' },
      { label: 'Shounen', value: 'shounen' },
      { label: 'Shounen Ai', value: 'shounen-ai' },
      { label: 'Slice of Life', value: 'slice-of-life' },
      { label: 'Spor', value: 'spor' },
      { label: 'Suç', value: 'suc' },
      { label: 'Süper Kahraman', value: 'super-kahraman' },
      { label: 'Tarih', value: 'tarih' },
      { label: 'Trajedi', value: 'trajedi' },
      { label: 'Vampir', value: 'vampir' },
      { label: 'Yaoi', value: 'yaoi' },
      { label: 'Yetişkin', value: 'yetiskin' },
      { label: 'Yuri', value: 'yuri' },
      { label: 'Zaman Yolculuğu', value: 'zaman-yolculugu' },
    ],
  },
];

async function load(url: string): Promise<HtmlElement> {
  const response = await http.get(absoluteUrl(BASE_URL, url), { headers });
  return html.load(response.body, { baseUrl: response.url });
}

const imageOf = (element: HtmlElement) => {
  const img = element.selectFirst('img');
  return img?.absUrl('src') || img?.absUrl('data-src') || undefined;
};

function parseGrid(document: HtmlElement): MangaPage {
  const items = document.select(CARDS).map((card): MangaSummary => ({
    url: relativeUrl(card.absUrl('href') || card.attr('href') || ''),
    title: card.selectFirst('.wl-name, .tur-name')?.text() || card.attr('title') || '',
    thumbnailUrl: imageOf(card),
  }));
  return { items, hasNextPage: document.selectFirst(NEXT) !== null };
}

// Date logic lifted from Madara: "3 gün önce" or "12 January, 24".
function parseChapterDate(date: string | undefined): number | undefined {
  if (!date) return undefined;
  if (!date.includes(' önce')) return parseDate(date, 'dd MMMM, yy');
  const number = Number.parseInt(/\d+/.exec(date)?.[0] ?? '', 10);
  if (Number.isNaN(number)) return undefined;
  const now = new Date();
  if (date.includes('yıl')) now.setFullYear(now.getFullYear() - number);
  else if (date.includes('ay')) now.setMonth(now.getMonth() - number);
  else if (date.includes('hafta')) now.setDate(now.getDate() - number * 7);
  else if (date.includes('gün')) now.setDate(now.getDate() - number);
  else if (date.includes('saat')) now.setHours(now.getHours() - number);
  else if (date.includes('dakika')) now.setMinutes(now.getMinutes() - number);
  else if (date.includes('ikinci')) now.setSeconds(now.getSeconds() - number);
  else return undefined;
  return now.getTime();
}

const text = (filters: FilterState, id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');

export default defineExtension({
  createSource: () => ({
    baseUrl: BASE_URL,
    async getPopular(page): Promise<MangaPage> {
      return parseGrid(await load(`/webtoon-listesi?sort=views&short_type=DESC&page=${page}`));
    },
    async getLatest(page): Promise<MangaPage> {
      const document = await load(`/son-eklenenler?page=${page}`);
      const items = document.select('.dsc-card').flatMap((card): MangaSummary[] => {
        const link = card.selectFirst('a.dsc-card-title, a.dsc-card-cover');
        if (!link) return [];
        return [
          {
            url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
            title: card.selectFirst('.dsc-card-title')?.text() || link.text(),
            thumbnailUrl: imageOf(card),
          },
        ];
      });
      return { items, hasNextPage: document.selectFirst(NEXT) !== null };
    },
    getFilters: () => FILTERS,
    async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
      const params = [`page=${page}`];
      if (query.trim()) params.push(`q=${encodeURIComponent(query.trim())}`);
      if (text(filters, 'genre')) params.push(`genre=${encodeURIComponent(text(filters, 'genre'))}`);
      const status = text(filters, 'status');
      if (status === 'uptodate') params.push('uptodate=1');
      else if (status) params.push(`status=${status}`);
      if (text(filters, 'sort')) params.push(`sort=${text(filters, 'sort')}`);
      if (text(filters, 'order')) params.push(`short_type=${text(filters, 'order')}`);
      return parseGrid(await load(`/webtoon-listesi?${params.join('&')}`));
    },
    async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
      const document = await load(manga.url);
      const authorLabel = 'Yazar & Çizer İsim(ler) : ';
      const author = document
        .select('p')
        .find((p) => p.text().includes(authorLabel))
        ?.text()
        .split(authorLabel)[1]
        ?.trim();
      const statusText = document
        .select('p')
        .find((p) => p.text().includes('Durum :'))
        ?.selectFirst('span')
        ?.text()
        .toLowerCase();
      const status: MangaStatus = ['ongoing', 'devam ediyor', 'güncel'].includes(statusText ?? '')
        ? 'ongoing'
        : ['complete', 'tamamlandı', 'bitti'].includes(statusText ?? '')
          ? 'completed'
          : 'unknown';
      const genres = document.select('li.movie__year a[href*=/tur/]').map((a) => a.text());
      return {
        url: manga.url,
        title: document.selectFirst('.movie__title')?.text() || manga.title,
        author: author || undefined,
        artist: author || undefined,
        genres: genres.length ? genres : undefined,
        status,
        description: document.selectFirst('.movie__plot')?.text().trim() || undefined,
        thumbnailUrl: document.selectFirst('meta[property=og:image]')?.absUrl('content') || manga.thumbnailUrl,
      };
    },
    async getChapters(manga: MangaSummary): Promise<Chapter[]> {
      const document = await load(manga.url);
      return document.select('tbody > tr').flatMap((row): Chapter[] => {
        const link = row.selectFirst('a');
        if (!link) return [];
        const number = Number.parseFloat(/\d+(\.\d+)?/.exec(link.text())?.[0] ?? '');
        return [
          {
            url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
            name: link.text().trim(),
            number: Number.isNaN(number) ? undefined : number,
            scanlator: row.selectFirst('td:nth-child(2) a:first-child')?.text().trim() || undefined,
            uploadedAt: parseChapterDate(row.selectFirst('td:last-child span:first-child')?.text()),
          },
        ];
      });
    },
    async getPages(chapter: Chapter): Promise<Page[]> {
      const document = await load(chapter.url);
      if (document.selectFirst('.rd-lock') || document.select('*').some((e) => ownText(e).includes('Üyelere Özel')))
        throw new Error('Bu bölüm üyelere özeldir. Okumak için tarayıcıdan giriş yapın');
      const seen = new Set<string>();
      return document
        .select('.reader-img, img[data-src]')
        .map((img) => img.absUrl('data-src') || img.absUrl('src'))
        .filter((url) => url && !seen.has(url) && !!seen.add(url))
        .map((imageUrl, index) => ({ index, imageUrl }));
    },
    imageHeaders: () => headers,
    resolveUrl(url: string): MangaSummary | null {
      const match = /^https?:\/\/([^/?#]+)\/webtoon\/([^/?#]+)/i.exec(url.trim());
      return match && match[1]!.toLowerCase().replace(/^www\./, '') === hostOf(BASE_URL)
        ? { url: `/webtoon/${match[2]}`, title: '' }
        : null;
    },
    getWebUrl: (item) => absoluteUrl(BASE_URL, item.url),
  }),
});
