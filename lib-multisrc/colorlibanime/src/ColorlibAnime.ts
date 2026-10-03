// ColorlibAnime, ported from keiyoushi/extensions-source lib-multisrc/colorlibanime. This directory is a
// template: every extension using the theme keeps an identical copy in src/colorlibanime/
// (`node scripts/sync-multisrc.mjs`) and overrides members in a subclass.
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
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl, selectFirstIgnoreCase } from './utils';

export abstract class ColorlibAnime {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;

  toThumbnail(element: HtmlElement | null | undefined): string | undefined {
    const bg = element?.selectFirst('.set-bg');
    const url = bg?.absUrl('data-setbg') || bg?.attr('data-setbg');
    return url ? url.replace(/\?[^?]*$/, '') : undefined;
  }

  getPopular(page: number): Promise<MangaPage> {
    return this.search('', page, { order: 'default' });
  }

  getLatest(page: number): Promise<MangaPage> {
    return this.search('', page, { order: 'updated' });
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const order = typeof filters.order === 'string' && filters.order ? filters.order : 'view';
    const url = `${this.baseUrl}/manga?page=${page}&sort=${encodeURIComponent(order)}&search=${encodeURIComponent(query.trim())}`;
    const document = await this.fetchDocument(url);
    const items = document.select('.product__page__content > [style]:has(.col-6) .product__item').map((element) => {
      const link = element.selectFirst('a.img-link');
      return {
        url: relativeUrl(link?.absUrl('href') || link?.attr('href') || ''),
        title: element.selectFirst('h5')?.text() ?? '',
        thumbnailUrl: this.toThumbnail(element),
      };
    });
    return {
      items: items.filter((m) => m.url && m.title),
      hasNextPage: document.selectFirst('.fa-angle-right') != null,
    };
  }

  // Details and chapters (same page)
  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url));
    const element = document.selectFirst('.anime__details__content');
    if (!element) return { url: manga.url, title: manga.title, status: 'unknown' };
    const statusText = (selectFirstIgnoreCase(element, 'li:contains(status)')?.text() ?? '')
      .split(' ')
      .slice(1)
      .join(' ');
    let status: MangaStatus = 'unknown';
    if (statusText.startsWith('Ongoing')) status = 'ongoing';
    else if (statusText.startsWith('Complete')) status = 'completed';
    return {
      url: manga.url,
      title: element.selectFirst('h3')?.text() || manga.title,
      author: element.selectFirst('h3 + span')?.text() || undefined,
      description:
        element
          .select('p')
          .map((p) => p.text())
          .join(' ') || undefined,
      thumbnailUrl: this.toThumbnail(element) ?? manga.thumbnailUrl,
      status,
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const response = await http.get(absoluteUrl(this.baseUrl, manga.url), { headers: this.headers() });
    const document = html.load(response.body, { baseUrl: response.url });
    const lastUpdated = /lastUpdated[\s\S]*?Date\((\d+)\)/.exec(response.body)?.[1];
    const chapters: Chapter[] = document.select('.anime__details__episodes a').map((a) => ({
      url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
      name: a.text(),
    }));
    if (chapters[0] && lastUpdated) chapters[0].uploadedAt = Number(lastUpdated);
    return chapters;
  }

  // Pages
  async getPages(chapter: Chapter): Promise<Page[]> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, chapter.url));
    return document
      .select('.container .read-img > img')
      .map((img) => img.absUrl('src') || img.attr('src') || '')
      .filter(Boolean)
      .map((imageUrl, index) => ({ index, imageUrl }));
  }

  imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  getFilters(): Filter[] {
    return [
      {
        type: 'select',
        id: 'order',
        label: 'Order By',
        options: [
          { label: 'A-Z', value: 'default' },
          { label: 'Updated', value: 'updated' },
          { label: 'New', value: 'published' },
          { label: 'Views', value: 'view' },
        ],
      },
    ];
  }

  // URLs
  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)(\/manga\/[^?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: match[2]!, title: '' };
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
