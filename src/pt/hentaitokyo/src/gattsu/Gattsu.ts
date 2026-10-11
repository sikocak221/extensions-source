// Gattsu (one-shot hentai galleries), ported from keiyoushi/extensions-source lib-multisrc/gattsu.
// This directory is a template: every extension using the theme keeps an identical copy in src/gattsu/
// (`node scripts/sync-multisrc.mjs`) and overrides members in a subclass. Every post is one chapter.
import type { Chapter, HtmlElement, MangaDetails, MangaPage, MangaSummary, Page, Source } from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl, selectIgnoreCase } from './utils';

const ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9';
const ACCEPT_IMAGE = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';
const ACCEPT_LANGUAGE = 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,es;q=0.6,gl;q=0.5';
const THUMB_SIZE = /-\d+x\d+\./;

export abstract class Gattsu {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;

  // Listing (the website has no popular listing: the latest posts are used)
  latestUpdatesSelector(): string {
    return `div.meio div.lista ul li a[href^="${this.baseUrl}"]`;
  }

  latestUpdatesNextPageSelector(): string {
    return 'ul.paginacao li.next > a';
  }

  searchMangaSelector(): string {
    return this.latestUpdatesSelector();
  }

  latestUpdatesFromElement(element: HtmlElement): MangaSummary | null {
    const title = element.selectFirst('span.thumb-titulo')?.text();
    const href = element.attr('href');
    if (!title || !href) return null;
    return {
      url: relativeUrl(href),
      title,
      thumbnailUrl: element.selectFirst('span.thumb-imagem img.wp-post-image')?.attr('src') || undefined,
    };
  }

  searchMangaFromElement(element: HtmlElement): MangaSummary | null {
    return this.latestUpdatesFromElement(element);
  }

  async getPopular(page: number): Promise<MangaPage> {
    const document = await this.fetchDocument(`${this.baseUrl}/${page === 1 ? '' : `page/${page}`}`);
    return this.parseList(document, this.latestUpdatesSelector(), (e) => this.latestUpdatesFromElement(e));
  }

  async search(query: string, page: number): Promise<MangaPage> {
    const document = await this.fetchDocument(
      `${this.baseUrl}/page/${page}/?s=${encodeURIComponent(query.trim())}&post_type=post`,
    );
    return this.parseList(document, this.searchMangaSelector(), (e) => this.searchMangaFromElement(e));
  }

  parseList(document: HtmlElement, selector: string, parse: (element: HtmlElement) => MangaSummary | null): MangaPage {
    const seen = new Set<string>();
    const items = document
      .select(selector)
      .map(parse)
      .filter((m): m is MangaSummary => m !== null)
      .filter((m) => !seen.has(m.url) && seen.add(m.url) !== undefined);
    return { items, hasNextPage: document.selectFirst(this.latestUpdatesNextPageSelector()) != null };
  }

  // Details and chapters come from the same page
  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url));
    return { ...this.mangaDetailsParse(document), url: manga.url };
  }

  mangaDetailsParse(document: HtmlElement): MangaDetails {
    const postBox = document.selectFirst('div.meio div.post-box');
    const text = (selector: string) => selectIgnoreCase(postBox ?? document, selector);
    return {
      url: '',
      title: postBox?.selectFirst('h1.post-titulo')?.text() ?? '',
      author: text('ul.post-itens li:contains(Artista) a')[0]?.text() || undefined,
      genres: text('ul.post-itens li:contains(Tags) a').map((a) => a.text()),
      description: (postBox?.select('div.post-texto p') ?? [])
        .map((p) => p.text())
        .join('\n\n')
        .replace('Sinopse :', '')
        .trim(),
      status: 'completed',
      thumbnailUrl: this.withoutSize(postBox?.selectFirst('div.post-capa > img.wp-post-image')?.attr('src')),
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url));
    return this.chapterListParse(document, manga);
  }

  chapterListParse(document: HtmlElement, manga: MangaSummary): Chapter[] {
    if (document.selectFirst(this.pageListSelector()) == null) return [];
    return document
      .select(this.chapterListSelector())
      .map((element) => this.chapterFromElement(element, manga, document));
  }

  chapterListSelector(): string {
    return 'div.meio div.post-box:has(h1.post-titulo)';
  }

  chapterFromElement(element: HtmlElement, manga: MangaSummary, document: HtmlElement): Chapter {
    const published = document.selectFirst('meta[property="article:published_time"]')?.attr('content');
    return {
      url: manga.url,
      name: 'Capítulo único',
      number: 1,
      scanlator: selectIgnoreCase(element, 'ul.post-itens li:contains(Tradutor) a')[0]?.text() || undefined,
      uploadedAt: parseDate(published?.split('T')[0], 'yyyy-MM-dd'),
    };
  }

  // Pages
  pageListSelector(): string {
    return 'div.meio div.post-box ul.post-fotos li a > img, div.meio div.post-box.listaImagens div.galeriaHtml img';
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, chapter.url));
    return document
      .select(this.pageListSelector())
      .map((img) => this.withoutSize(img.attr('data-src') ? img.absUrl('data-src') : img.absUrl('src')))
      .filter((imageUrl): imageUrl is string => Boolean(imageUrl))
      .map((imageUrl, index) => ({ index, imageUrl }));
  }

  imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Accept: ACCEPT_IMAGE, Referer: `${this.baseUrl}/` };
  }

  withoutSize(url: string | null | undefined): string | undefined {
    return url ? url.replace(THUMB_SIZE, '.') : undefined;
  }

  // URLs
  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)([^?#]*)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    const path = match[2] ?? '';
    if (!path.split('/').some(Boolean)) return null;
    return { url: path, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return absoluteUrl(this.baseUrl, item.url);
  }

  // Helpers
  headers(): Record<string, string> {
    return {
      'User-Agent': this.userAgent,
      Referer: `${this.baseUrl}/`,
      Accept: ACCEPT,
      'Accept-Language': ACCEPT_LANGUAGE,
    };
  }

  async fetchDocument(url: string): Promise<HtmlElement> {
    const response = await http.get(url, { headers: this.headers() });
    return html.load(response.body, { baseUrl: response.url });
  }

  toSource(): Source {
    return {
      baseUrl: this.baseUrl,
      getPopular: (page) => this.getPopular(page),
      search: (query, page) => this.search(query, page),
      getMangaDetails: (manga) => this.getMangaDetails(manga),
      getChapters: (manga) => this.getChapters(manga),
      getPages: (chapter) => this.getPages(chapter),
      imageHeaders: () => this.imageHeaders(),
      resolveUrl: (url) => this.resolveUrl(url),
      getWebUrl: (item) => this.getWebUrl(item),
    };
  }
}
