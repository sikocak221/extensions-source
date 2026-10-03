// Hwalumi, ported from keiyoushi/extensions-source lib-multisrc/hwalumi. This directory is a template:
// every extension using the theme keeps an identical copy in src/hwalumi/ (`node scripts/sync-multisrc.mjs`)
// and overrides members in a subclass. Manga urls are "/comic/<slug>".
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
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl, selectFirstIgnoreCase, withQuery } from './utils';

export abstract class Hwalumi {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;

  // Listing
  async getPopular(page: number): Promise<MangaPage> {
    return this.parseMangaList(
      await this.fetchDocument(`${this.baseUrl}/all-series?sort=popular&lang=id&page=${page}`),
      page,
    );
  }

  async getLatest(page: number): Promise<MangaPage> {
    return this.parseMangaList(
      await this.fetchDocument(`${this.baseUrl}/all-series?sort=latest&lang=id&page=${page}`),
      page,
    );
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');
    const genres = Object.entries(filters)
      .filter(([id, value]) => id.startsWith('genre.') && value === true)
      .map(([id]) => id.slice('genre.'.length));
    const url = withQuery(`${this.baseUrl}/browse`, {
      q: query.trim() || undefined,
      sort: text('sort') || 'latest',
      status: text('status') || undefined,
      type: text('type') || undefined,
      genre: genres.length > 0 ? genres.join(',') : undefined,
      lang: 'id',
      page: String(page),
    });
    return this.parseMangaList(await this.fetchDocument(url), page);
  }

  parseMangaList(document: HtmlElement, page: number): MangaPage {
    const seen = new Set<string>();
    const items: MangaSummary[] = [];
    for (const element of document.select('a[href^="/comic/"]:has(img:not([src*="flagcdn"]))')) {
      const img = element.selectFirst('img');
      const title = img?.attr('alt')?.trim() || element.text();
      const url = this.mangaPath(element.attr('href') ?? '');
      if (!img || !title || !url || seen.has(url)) continue;
      seen.add(url);
      items.push({ url, title, thumbnailUrl: img.absUrl('src') || img.attr('src') || undefined });
    }
    return { items, hasNextPage: document.selectFirst(`a[href*="page=${page + 1}"]`) != null };
  }

  mangaPath(url: string): string {
    const slug = relativeUrl(url)
      .replace(/[?#].*$/, '')
      .split('/')
      .filter(Boolean)
      .pop();
    return slug ? `/comic/${slug}` : '';
  }

  // Details and chapters (same page)
  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url));
    const encoded = document.selectFirst('div[data-sr]')?.attr('data-sr')?.trim();
    let description: string | undefined;
    if (encoded) {
      try {
        description = base64.decode(encoded + '='.repeat((4 - (encoded.length % 4)) % 4)).trim() || undefined;
      } catch {
        description = undefined;
      }
    }
    description ??= document.selectFirst('p.text-sm')?.text() || undefined;
    const info = (label: string) => {
      const value = selectFirstIgnoreCase(document, `div:has(> span:contains(${label})) > span:last-child`)?.text();
      return value && value.toLowerCase() !== 'updating' ? value : undefined;
    };
    const statusText =
      selectFirstIgnoreCase(document, 'div:has(> div:contains(Status)) > div:last-child')?.text().toLowerCase() ?? '';
    let status: MangaStatus = 'unknown';
    if (statusText === 'completed' || statusText === 'tamat') status = 'completed';
    else if (statusText === 'ongoing' || statusText === 'berjalan') status = 'ongoing';
    else if (statusText === 'hiatus') status = 'hiatus';
    return {
      url: manga.url,
      title: document.selectFirst('h1')?.text() || manga.title,
      thumbnailUrl: document.selectFirst('aside img[src*="/cover"]')?.absUrl('src') || manga.thumbnailUrl,
      description,
      author: info('Author'),
      artist: info('Artist'),
      genres: [
        ...new Set(
          document
            .select('a[href*="genre="]')
            .map((a) => a.text())
            .filter(Boolean),
        ),
      ],
      status,
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url));
    return document.select('a[href*="/read/"][data-chapter]').map((element) => {
      const number = Number.parseFloat(element.attr('data-chapter') ?? '');
      return {
        url: relativeUrl(element.absUrl('href') || element.attr('href') || ''),
        name: element.selectFirst('span.text-sm, span[class*="font-semibold"]')?.text() || element.text(),
        number: Number.isFinite(number) ? number : undefined,
        uploadedAt: parseIndonesianRelativeDate(
          element.selectFirst('span.tabular-nums, span[class*="tabular-nums"]')?.text(),
        ),
      };
    });
  }

  // Pages
  async getPages(chapter: Chapter): Promise<Page[]> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, chapter.url));
    return document
      .select('img[alt^="Page "]')
      .map((img) => img.absUrl('src') || img.attr('src') || '')
      .filter((url) => url && !url.includes('/api/image/p/'))
      .map((imageUrl, index) => ({ index, imageUrl }));
  }

  imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  // Filters
  async getFilters(): Promise<Filter[]> {
    const filters: Filter[] = [
      {
        type: 'select',
        id: 'sort',
        label: 'Urutkan',
        options: [
          { label: 'Terbaru', value: 'latest' },
          { label: 'Populer', value: 'popular' },
          { label: 'Rating', value: 'rating' },
          { label: 'A - Z', value: 'az' },
        ],
      },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [
          { label: 'Semua', value: '' },
          { label: 'Ongoing', value: 'ongoing' },
          { label: 'Completed', value: 'completed' },
          { label: 'Hiatus', value: 'hiatus' },
        ],
      },
      {
        type: 'select',
        id: 'type',
        label: 'Tipe',
        options: [
          { label: 'Semua', value: '' },
          { label: 'Manga', value: 'manga' },
          { label: 'Manhwa', value: 'manhwa' },
          { label: 'Manhua', value: 'manhua' },
        ],
      },
    ];
    try {
      const document = await this.fetchDocument(`${this.baseUrl}/browse`);
      const seen = new Set<string>();
      const genres = document.select('label[data-bf-genre-name]').flatMap((label) => {
        const value = label.selectFirst('input.bf-genre-cb[value]')?.attr('value')?.trim();
        const name = label.selectFirst('span.truncate')?.text();
        if (!value || !name || seen.has(value)) return [];
        seen.add(value);
        return [{ type: 'checkbox' as const, id: `genre.${value}`, label: name }];
      });
      if (genres.length > 0) filters.push({ type: 'group', id: 'genre', label: 'Genre', filters: genres });
    } catch (error) {
      log.warn('Cannot load genres', error);
    }
    return filters;
  }

  // URLs
  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/(?:comic|komik)\/([^/?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: `/comic/${match[2]}`, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return absoluteUrl(this.baseUrl, item.url);
  }

  // Helpers
  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  async fetchDocument(url: string): Promise<HtmlElement> {
    const response = await http.get(url, { headers: this.headers() });
    return html.load(response.body, { baseUrl: response.url });
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

/** "5 menit yang lalu", "baru saja", … → epoch ms. */
export function parseIndonesianRelativeDate(text: string | null | undefined): number | undefined {
  const value = text?.toLowerCase().trim();
  if (!value) return undefined;
  if (value === 'baru saja') return Date.now();
  const amount = Number.parseInt(/\d+/.exec(value)?.[0] ?? '', 10);
  if (Number.isNaN(amount)) return undefined;
  const date = new Date();
  if (value.includes('detik')) date.setSeconds(date.getSeconds() - amount);
  else if (value.includes('menit')) date.setMinutes(date.getMinutes() - amount);
  else if (value.includes('jam')) date.setHours(date.getHours() - amount);
  else if (value.includes('hari')) date.setDate(date.getDate() - amount);
  else if (value.includes('minggu')) date.setDate(date.getDate() - amount * 7);
  else if (value.includes('bulan')) date.setMonth(date.getMonth() - amount);
  else if (value.includes('tahun')) date.setFullYear(date.getFullYear() - amount);
  else return undefined;
  return date.getTime();
}
