// SingleSeries: a Matane helper (not a Tachiyomi theme) for sites that hold one series, mostly webcomics.
// This directory is a template: every extension using it keeps an identical copy in src/singleseries/
// (`node scripts/sync-multisrc.mjs`).
//
// The catalogue is the one `series` (or a fixed `catalogue` of a few); subclasses list chapters and pages.
import type { Chapter, HtmlElement, MangaDetails, MangaPage, MangaSummary, Page, Source } from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf } from './utils';

export abstract class SingleSeries {
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  /** The series; `url` is the path its chapters are listed from (resolveUrl maps every site url to it). */
  abstract readonly series: MangaDetails;

  userAgent = USER_AGENT;

  /** Sites with a few fixed series list them all here. */
  get catalogue(): MangaDetails[] {
    return [this.series];
  }

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  async fetchDocument(url: string): Promise<HtmlElement> {
    const response = await http.get(absoluteUrl(this.baseUrl, url), { headers: this.headers() });
    return html.load(response.body, { baseUrl: response.url });
  }

  summary(series: MangaDetails = this.series): MangaSummary {
    const { url, title, thumbnailUrl } = series;
    return { url, title, thumbnailUrl };
  }

  getPopular(): MangaPage | Promise<MangaPage> {
    return { items: this.catalogue.map((s) => this.summary(s)), hasNextPage: false };
  }

  search(query: string): MangaPage {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const items = this.catalogue.filter((s) => words.every((w) => s.title.toLowerCase().includes(w)));
    return { items: items.map((s) => this.summary(s)), hasNextPage: false };
  }

  /** Override to fill details from the site (e.g. a cover that changes). */
  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    return this.catalogue.find((s) => s.url === manga.url) ?? this.series;
  }

  abstract getChapters(manga: MangaSummary): Promise<Chapter[]>;

  abstract getPages(chapter: Chapter): Promise<Page[]>;

  /** For pages listed by `url` only (one site page per image). */
  getImageUrl?(page: Page): Promise<string>;

  /** Image urls of `selector` in the chapter page. */
  async imagesOf(chapter: Chapter, selector: string, attributes = ['src']): Promise<Page[]> {
    const document = await this.fetchDocument(chapter.url);
    return document
      .select(selector)
      .map((img) => attributes.map((a) => img.absUrl(a) || img.attr(a)?.trim() || '').find(Boolean) ?? '')
      .filter(Boolean)
      .map((imageUrl, index) => ({ index, imageUrl }));
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)([^#]*)/i.exec(url.trim());
    if (!match || match[1]!.toLowerCase().replace(/^www\./, '') !== hostOf(this.baseUrl).replace(/^www\./, ''))
      return null;
    const series = this.catalogue.find((s) => s.url !== '/' && match[2]!.startsWith(s.url)) ?? this.series;
    return this.summary(series);
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return absoluteUrl(this.baseUrl, item.url);
  }

  toSource(): Source {
    return {
      baseUrl: this.baseUrl,
      getPopular: async () => this.getPopular(),
      search: async (query) => this.search(query),
      getMangaDetails: (manga) => this.getMangaDetails(manga),
      getChapters: (manga) => this.getChapters(manga),
      getPages: (chapter) => this.getPages(chapter),
      ...(this.getImageUrl ? { getImageUrl: (page: Page) => this.getImageUrl!(page) } : {}),
      imageHeaders: () => this.imageHeaders(),
      resolveUrl: (url) => this.resolveUrl(url),
      getWebUrl: (item) => this.getWebUrl(item),
    };
  }
}
