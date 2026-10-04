// MangaWorld, ported from keiyoushi/extensions-source lib-multisrc/mangaworld. This directory is a template:
// every extension using the theme keeps an identical copy in src/mangaworld/ (`node scripts/sync-multisrc.mjs`).
//
// Manga urls are "/manga/<id>/<slug>", chapter urls "/manga/<id>/<slug>/read/<id>?style=list".
import type {
  Chapter,
  Filter,
  FilterState,
  HtmlElement,
  MangaDetails,
  MangaPage,
  MangaStatus,
  MangaSummary,
  Page,
  Source,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, relativeUrl } from './utils';

const IMAGE_USER_AGENT =
  'Mozilla/5.0 (Linux; U; Android 4.1.1; en-gb; Build/KLP) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Safari/534.30';

const SORTS: [string, string][] = [
  ['Rilevanza', ''],
  ['Più letti', 'most_read'],
  ['Meno letti', 'less_read'],
  ['Più recenti', 'newest'],
  ['Meno recenti', 'oldest'],
  ['A-Z', 'a-z'],
  ['Z-A', 'z-a'],
];

const ITALIAN_MONTHS = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
];

const GENRES: [string, string][] = [
  ['Adulti', 'adulti'],
  ['Arti Marziali', 'arti-marziali'],
  ['Avventura', 'avventura'],
  ['Azione', 'azione'],
  ['Commedia', 'commedia'],
  ['Doujinshi', 'doujinshi'],
  ['Drammatico', 'drammatico'],
  ['Ecchi', 'ecchi'],
  ['Fantasy', 'fantasy'],
  ['Gender Bender', 'gender-bender'],
  ['Harem', 'harem'],
  ['Hentai', 'hentai'],
  ['Horror', 'horror'],
  ['Josei', 'josei'],
  ['Lolicon', 'lolicon'],
  ['Maturo', 'maturo'],
  ['Mecha', 'mecha'],
  ['Mistero', 'mistero'],
  ['Psicologico', 'psicologico'],
  ['Romantico', 'romantico'],
  ['Sci-fi', 'sci-fi'],
  ['Scolastico', 'scolastico'],
  ['Seinen', 'seinen'],
  ['Shotacon', 'shotacon'],
  ['Shoujo', 'shoujo'],
  ['Shoujo Ai', 'shoujo-ai'],
  ['Shounen', 'shounen'],
  ['Shounen Ai', 'shounen-ai'],
  ['Slice of Life', 'slice-of-life'],
  ['Smut', 'smut'],
  ['Soprannaturale', 'soprannaturale'],
  ['Sport', 'sport'],
  ['Storico', 'storico'],
  ['Tragico', 'tragico'],
  ['Yaoi', 'yaoi'],
  ['Yuri', 'yuri'],
];

const MTYPES: [string, string][] = [
  ['Manga', 'manga'],
  ['Manhua', 'manhua'],
  ['Manhwa', 'manhwa'],
  ['Oneshot', 'oneshot'],
  ['Thai', 'thai'],
  ['Vietnamita', 'vietnamese'],
];

const STATUSES: [string, string][] = [
  ['In corso', 'ongoing'],
  ['Finito', 'completed'],
  ['Droppato', 'dropped'],
  ['In pausa', 'paused'],
  ['Cancellato', 'canceled'],
];

export abstract class MangaWorld {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;
  /** Cookie of the site's JS challenge ("MWCookie…"), kept for later requests. */
  private challengeCookie = '';

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/`, ...this.cookieHeader() };
  }

  private cookieHeader(): Record<string, string> {
    return this.challengeCookie ? { Cookie: this.challengeCookie } : {};
  }

  imageHeaders(): Record<string, string> {
    return { 'User-Agent': IMAGE_USER_AGENT, Referer: `${this.baseUrl}/` };
  }

  /** The site first answers some requests with a page that sets "MWCookie…" from JS: set it and retry. */
  async fetchDocument(url: string): Promise<HtmlElement> {
    let response = await http.get(url, { headers: this.headers() });
    const hasVary = Object.keys(response.headers).some((name) => name.toLowerCase() === 'vary');
    const cookie = /document\.cookie="(MWCookie[^"]+)/.exec(response.body)?.[1];
    if (!hasVary && cookie) {
      this.challengeCookie = cookie.split(';')[0]!;
      response = await http.get(url, { headers: this.headers() });
    }
    return html.load(response.body, { baseUrl: response.url });
  }

  searchMangaFromElement(element: HtmlElement): MangaSummary {
    const link = element.selectFirst('a');
    return {
      url: relativeUrl(link?.absUrl('href') ?? '').replace(/\/$/, ''),
      title: link?.attr('title') ?? '',
      thumbnailUrl: element.selectFirst('a.thumb img')?.absUrl('src') || undefined,
    };
  }

  parseMangasPage(document: HtmlElement): MangaPage {
    const items = document.select('div.comics-grid .entry').map((e) => this.searchMangaFromElement(e));
    return { items, hasNextPage: items.length === 16 };
  }

  async getPopular(page: number): Promise<MangaPage> {
    return this.parseMangasPage(await this.fetchDocument(`${this.baseUrl}/archive?sort=most_read&page=${page}`));
  }

  async getLatest(page: number): Promise<MangaPage> {
    return this.parseMangasPage(await this.fetchDocument(`${this.baseUrl}/?page=${page}`));
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const params: [string, string][] = [['page', String(page)]];
    if (query) params.push(['keyword', query]);
    const year = filters.year;
    if (typeof year === 'string' && year) params.push(['year', year]);
    const sort = filters.sort;
    if (typeof sort === 'string' && sort) params.push(['sort', sort]);
    for (const [param, prefix, items] of [
      ['status', 'status', STATUSES],
      ['genre', 'genre', GENRES],
      ['type', 'type', MTYPES],
    ] as const) {
      for (const [, id] of items) if (filters[`${prefix}.${id}`] === true) params.push([param, id]);
    }
    const qs = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    return this.parseMangasPage(await this.fetchDocument(`${this.baseUrl}/archive?${qs}`));
  }

  getFilters(): Filter[] {
    const checkboxes = (prefix: string, items: [string, string][]): Filter[] =>
      items.map(([label, id]) => ({ type: 'checkbox', id: `${prefix}.${id}`, label }));
    return [
      { type: 'text', id: 'year', label: 'Anno di uscita' },
      {
        type: 'select',
        id: 'sort',
        label: 'Ordina per',
        options: SORTS.map(([label, value]) => ({ label, value })),
        default: '',
      },
      { type: 'group', id: 'status', label: 'Stato', filters: checkboxes('status', STATUSES) },
      { type: 'group', id: 'genre', label: 'Generi', filters: checkboxes('genre', GENRES) },
      { type: 'group', id: 'type', label: 'Tipologia', filters: checkboxes('type', MTYPES) },
    ];
  }

  parseStatus(status: string | null | undefined): MangaStatus {
    switch (status?.toLowerCase()) {
      case 'in corso':
        return 'ongoing';
      case 'finito':
        return 'completed';
      case 'in pausa':
        return 'hiatus';
      case 'cancellato':
        return 'cancelled';
      default:
        return 'unknown';
    }
  }

  parseChapterDate(text: string | null | undefined): number | undefined {
    const match = /(\d{1,2})\s+([^\s\d]+)\s+(\d{4})/.exec(text ?? '');
    if (!match) return undefined;
    const month = ITALIAN_MONTHS.indexOf(match[2]!.toLowerCase());
    return month < 0 ? undefined : Date.UTC(Number(match[3]), month, Number(match[1]));
  }

  parseChapterNumber(name: string): number | undefined {
    const number = /capitolo\s([0-9]+)/i.exec(name)?.[1];
    return number ? Number.parseFloat(number) : undefined;
  }

  fixChapterUrl(url: string): string {
    if (!url) return '';
    const params = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
    if (params.includes('style=list')) return url;
    if (params.includes('style=pages')) return url.replace('style=pages', 'style=list');
    return params ? `${url}&style=list` : `${url}?style=list`;
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const document = await this.fetchDocument(`${this.baseUrl}${manga.url}`);
    const info = document.selectFirst('div.comic-info');
    if (!info) throw new Error('Page not found');
    const otherTitle = document.selectFirst('div.meta-data > div')?.text();
    const description = [
      document.selectFirst('div#noidungm')?.text(),
      otherTitle?.includes('Titoli alternativi') ? otherTitle : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    return {
      url: manga.url,
      title: document.selectFirst('div.comic-info h1')?.text() || manga.title,
      author: info.selectFirst('a[href*="/archive?author="]')?.text() || undefined,
      artist: info.selectFirst('a[href*="/archive?artist="]')?.text() || undefined,
      thumbnailUrl: info.selectFirst('.thumb > img')?.absUrl('src') || manga.thumbnailUrl,
      description: description || undefined,
      genres: info.select('div.meta-data a.badge').map((e) => e.text()),
      status: this.parseStatus(info.selectFirst('a[href*="/archive?status="]')?.text()),
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const document = await this.fetchDocument(`${this.baseUrl}${manga.url}`);
    return document.select('.chapters-wrapper .chapter').map((element) => {
      const link = element.selectFirst('a.chap');
      if (!link) throw new Error('Url not found');
      const name = element.selectFirst('span.d-inline-block')?.text() ?? '';
      const dates = element.select('.chap-date');
      return {
        url: relativeUrl(this.fixChapterUrl(link.absUrl('href') ?? '')),
        name,
        number: this.parseChapterNumber(name),
        uploadedAt: this.parseChapterDate(dates[dates.length - 1]?.text()),
      };
    });
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const document = await this.fetchDocument(`${this.baseUrl}${chapter.url}`);
    return document.select('div#page img.page-image').map((img, index) => ({ index, imageUrl: img.absUrl('src') }));
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)(\/manga\/[^/?#]+\/[^/?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: match[2]!, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return `${this.baseUrl}${item.url}`;
  }

  toSource(): Source {
    return {
      baseUrl: this.baseUrl,
      getPopular: (page) => this.getPopular(page),
      getLatest: (page) => this.getLatest(page),
      search: (query, page, filters) => this.search(query, page, filters),
      getFilters: () => this.getFilters(),
      getMangaDetails: (manga) => this.getMangaDetails(manga),
      getChapters: (manga) => this.getChapters(manga),
      getPages: (chapter) => this.getPages(chapter),
      imageHeaders: () => this.imageHeaders(),
      resolveUrl: (url) => this.resolveUrl(url),
      getWebUrl: (item) => this.getWebUrl(item),
    };
  }
}
