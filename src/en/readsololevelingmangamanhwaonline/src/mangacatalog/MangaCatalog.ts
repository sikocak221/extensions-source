// MangaCatalog (a network of single-franchise sites), ported from keiyoushi/extensions-source
// lib-multisrc/mangacatalog. This directory is a template: every extension using the theme keeps an
// identical copy in src/mangacatalog/ (`node scripts/sync-multisrc.mjs`) and lists its series.
import type { Chapter, HtmlElement, MangaDetails, MangaPage, MangaSummary, Page, Source } from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl } from './utils';

export abstract class MangaCatalog {
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  /** [title, path] of every series on the site. */
  abstract readonly sourceList: [string, string][];

  userAgent = USER_AGENT;

  catalogue(): MangaSummary[] {
    const seen = new Set<string>();
    return [...this.sourceList]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .filter(([, url]) => !seen.has(url) && Boolean(seen.add(url)))
      .map(([title, url]) => ({ url, title }));
  }

  async getPopular(): Promise<MangaPage> {
    return { items: this.catalogue(), hasNextPage: false };
  }

  async search(query: string): Promise<MangaPage> {
    const q = query.trim().toLowerCase();
    return { items: this.catalogue().filter((m) => m.title.toLowerCase().includes(q)), hasNextPage: false };
  }

  // Details and chapters come from the same page.
  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    return this.mangaDetailsParse(await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url)), manga);
  }

  mangaDetailsParse(document: HtmlElement, manga: MangaSummary): MangaDetails {
    const info = document
      .select('div.bg-bg-secondary > div.px-6 > div.flex-col')
      .map((el) => el.text())
      .join(' ');
    return {
      url: manga.url,
      title: document.selectFirst('div.container > h1')?.text() || manga.title,
      description:
        (info.includes('Description') ? info.slice(info.indexOf('Description') + 11).trim() : info) || undefined,
      thumbnailUrl: document.selectFirst('div.flex > img')?.absUrl('src') || undefined,
      status: 'unknown',
    };
  }

  chapterListSelector(): string {
    return 'div.w-full > div.bg-bg-secondary > div.grid';
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url));
    const chapters = document
      .select(this.chapterListSelector())
      .map((element) => this.chapterFromElement(element))
      .filter((chapter) => chapter.url);
    if (chapters.length > 0) return chapters;
    // Older sites of the network: a Bootstrap table (name, date, "Read" link).
    return document.select('table tbody tr').flatMap((row): Chapter[] => {
      const link = row.selectFirst('a[href*="/chapter/"]');
      const cells = row.select('td');
      if (!link) return [];
      return [
        {
          url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
          name: cells[0]?.text() || link.text(),
          uploadedAt: parseDate(cells[1]?.text(), 'MMM d, yyyy'),
        },
      ];
    });
  }

  chapterFromElement(element: HtmlElement): Chapter {
    const link = element.selectFirst('.col-span-4 > a');
    const name1 = element
      .select('.col-span-4 > a')
      .map((a) => a.text())
      .join(' ');
    const name2 = element
      .select('.text-xs:not(a)')
      .map((el) => el.text())
      .join(' ');
    return {
      url: relativeUrl(link?.absUrl('href') || link?.attr('href') || ''),
      name: name2 ? `${name1} - ${name2}` : name1,
    };
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, chapter.url));
    return this.pageListParse(document);
  }

  pageListParse(document: HtmlElement): Page[] {
    const lazy = document.select('img[data-src]');
    // Older sites: plain images in the reader.
    const images =
      lazy.length > 0 ? lazy : document.select('.js-pages-container img, .img_container img, #content img.img-fluid');
    return images
      .map((img) => img.absUrl('data-src') || img.absUrl('src') || '')
      .filter(Boolean)
      .map((imageUrl, index) => ({ index, imageUrl }));
  }

  imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)(\/manga\/[^/?#]+\/?)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    const found = this.sourceList.find(([, path]) => path.replace(/\/+$/, '') === match[2]!.replace(/\/+$/, ''));
    return { url: found?.[1] ?? match[2]!, title: found?.[0] ?? '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return absoluteUrl(this.baseUrl, item.url);
  }

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
      getPopular: () => this.getPopular(),
      search: (query) => this.search(query),
      getMangaDetails: (manga) => this.getMangaDetails(manga),
      getChapters: (manga) => this.getChapters(manga),
      getPages: (chapter) => this.getPages(chapter),
      imageHeaders: () => this.imageHeaders(),
      resolveUrl: (url) => this.resolveUrl(url),
      getWebUrl: (item) => this.getWebUrl(item),
    };
  }
}
