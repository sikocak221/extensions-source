// ScanReader (WordPress reader with its own "manga-card" markup), ported from keiyoushi/extensions-source
// lib-multisrc/scanreader. This directory is a template: every extension using the theme keeps an identical copy
// in src/scanreader/ (`node scripts/sync-multisrc.mjs`).
//
// Manga urls are "/mangas/<slug>/", chapter urls "/chapitre/<slug>/".
import type {
  Chapter,
  HtmlElement,
  MangaDetails,
  MangaPage,
  MangaStatus,
  MangaSummary,
  Page,
  Source,
} from '@matane/extension-sdk';
import { USER_AGENT, decodeEntities, hostOf, parseDate, relativeUrl } from './utils';

const ON_CLICK_COVER = /addToHistory\(\d+\s*,\s*'[^']*'\s*,\s*'([^']+)'/;
const IMAGE_ARRAY = /(?:const|let|var)\s+\w+\s*=\s*\[((?:\s*"[A-Za-z0-9+/=]+"(?:\s*,\s*)?)+)\s*]/;
const IMAGE_ITEM = /"([A-Za-z0-9+/=]{20,})"/g;

export abstract class ScanReader {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  async fetchDocument(url: string): Promise<HtmlElement> {
    const response = await http.get(url, { headers: this.headers() });
    return html.load(response.body, { baseUrl: response.url });
  }

  // Popular
  async getPopular(page: number): Promise<MangaPage> {
    if (page === 1) {
      const document = await this.fetchDocument(this.baseUrl);
      const items = this.cards(document.select('div.popular-section div.manga-card'));
      return { items, hasNextPage: items.length > 0 };
    }
    const url =
      page > 2
        ? `${this.baseUrl}/bibliotheque/page/${page - 1}/?sort=views`
        : `${this.baseUrl}/bibliotheque/?sort=views`;
    const document = await this.fetchDocument(url);
    return {
      items: this.cards(document.select('div.manga-card')),
      hasNextPage: !!document.selectFirst('a.pagination-next'),
    };
  }

  // Latest
  async getLatest(page: number): Promise<MangaPage> {
    const url = page > 1 ? `${this.baseUrl}/dernieres-sorties/page/${page}/` : `${this.baseUrl}/dernieres-sorties/`;
    const document = await this.fetchDocument(url);
    // The title is in the element after the cover: both sit in the same row.
    const items = document
      .select('div:has(> div.manga-cover)')
      .flatMap((row): MangaSummary[] => this.mangaFromLatestRow(row) ?? [])
      .filter((manga) => !manga.title.includes('(Novel)'));
    return { items, hasNextPage: !!document.selectFirst('a.pagination-next') };
  }

  // Search
  async search(query: string): Promise<MangaPage> {
    const document = await this.fetchDocument(`${this.baseUrl}/?s=${encodeURIComponent(query.trim())}&post_type=manga`);
    return { items: this.cards(document.select('div.manga-card')), hasNextPage: false };
  }

  // Details
  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const document = await this.fetchDocument(this.absolute(manga.url));
    return this.parseDetails(document, manga);
  }

  parseDetails(document: HtmlElement, manga: MangaSummary): MangaDetails {
    const details: MangaDetails = {
      url: manga.url,
      title: document.selectFirst('h1.manga-title')?.text() || manga.title,
      thumbnailUrl:
        document.selectFirst("meta[property='og:image']")?.absUrl('content') ||
        this.lazySrc(document.selectFirst('img.wp-post-image')) ||
        manga.thumbnailUrl,
      description: document.selectFirst("div.manga-content div[style*='background: #333'] p")?.text() || undefined,
      status: 'unknown',
    };
    for (const row of document.select('div.manga-info-grid > div')) {
      const label = row.selectFirst('div:first-child')?.text().toLowerCase();
      const value = row.selectFirst('div:last-child');
      if (!label || !value) continue;
      if (label.includes('auteur')) details.author = value.text();
      else if (label.includes('genres')) details.genres = value.select('span').map((span) => span.text());
      else if (label.includes('statut')) details.status = this.toStatus(value.text().toLowerCase());
    }
    return details;
  }

  toStatus(text: string): MangaStatus {
    if (text.includes('cours')) return 'ongoing';
    if (text.includes('terminé')) return 'completed';
    if (text.includes('hiatus')) return 'hiatus';
    return 'unknown';
  }

  // Chapters
  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const url = this.absolute(manga.url);
    const document = await this.fetchDocument(url);
    const container = document.selectFirst('#secure-chapters-container');
    const mangaId = container?.attr('data-manga-id') ?? '';
    const nonce = container?.attr('data-nonce') ?? '';
    if (!mangaId.trim() || !nonce.trim()) return [];
    const response = await http.post(
      `${this.baseUrl}/wp-admin/admin-ajax.php`,
      { form: { action: 'load_protected_chapters_html', manga_id: mangaId, nonce } },
      { headers: { ...this.headers(), Referer: url, 'X-Requested-With': 'XMLHttpRequest' } },
    );
    return this.parseChapterList(response.body);
  }

  /** The reply is raw HTML or a JSON envelope: {"success":true,"data":"<html>"}. */
  parseChapterList(body: string): Chapter[] {
    let markup = body;
    try {
      const data = (JSON.parse(body) as { data?: string | null }).data;
      if (typeof data === 'string') markup = data;
    } catch {
      // raw HTML
    }
    if (markup.trim() === '0' || markup.trim() === '-1') return [];

    // One chunk per chapter link. The team link nested in a chapter card makes HTML parsers split the card, so the
    // fields are read from the text of the chunk.
    const chunks = markup.split(/(?=<a\s[^>]*href=["'][^"']*\/chapitre\/)/).filter((c) => /^<a\s/.test(c));
    return chunks.flatMap((chunk): Chapter[] => {
      const href = /^<a\s[^>]*href=["']([^"']+)["']/.exec(chunk)?.[1];
      const name = /<h4[^>]*>([\s\S]*?)<\/h4>/.exec(chunk)?.[1];
      if (!href || name === undefined) return [];
      const clean = (text: string) =>
        decodeEntities(text.replace(/<[^>]+>/g, ' '))
          .replace(/\s+/g, ' ')
          .trim();
      const afterName = chunk.substring(chunk.indexOf('</h4>'));
      const date = /(\d{2}\/\d{2}\/\d{4})/.exec(afterName)?.[1];
      const team = /<a\s[^>]*title=["'][^"']*Team[^"']*["'][^>]*>([\s\S]*?)<\/a>/.exec(chunk)?.[1];
      return [
        {
          url: relativeUrl(this.absolute(decodeEntities(href))),
          name: clean(name),
          scanlator: team ? clean(team) || undefined : undefined,
          uploadedAt: date ? parseDate(date, 'dd/MM/yyyy') : undefined,
        },
      ];
    });
  }

  // Pages
  async getPages(chapter: Chapter): Promise<Page[]> {
    const response = await http.get(this.absolute(chapter.url), { headers: this.headers() });
    const array = IMAGE_ARRAY.exec(response.body)?.[1];
    if (!array) return [];
    return [...array.matchAll(IMAGE_ITEM)].map((match, index) => ({
      index,
      imageUrl: [...base64.decode(match[1]!)].reverse().join(''),
    }));
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  // Helpers
  cards(elements: HtmlElement[]): MangaSummary[] {
    return elements
      .flatMap((card): MangaSummary[] => this.mangaFromCard(card) ?? [])
      .filter((m) => !m.title.includes('(Novel)'));
  }

  mangaFromCard(card: HtmlElement): MangaSummary[] | null {
    const link = card.selectFirst('a');
    const title = card.selectFirst('h3')?.text();
    if (!link || !title) return null;
    const cover = ON_CLICK_COVER.exec(link.attr('onclick') ?? '')?.[1] ?? this.lazySrc(card.selectFirst('img'));
    return [{ url: relativeUrl(link.attr('href') ?? ''), title, thumbnailUrl: cover || undefined }];
  }

  mangaFromLatestRow(row: HtmlElement): MangaSummary[] | null {
    const cover = row.selectFirst('div.manga-cover');
    const href = cover?.selectFirst('a')?.absUrl('href');
    const title = row.selectFirst('h3.manga-title-display')?.text();
    if (!href || !title) return null;
    return [{ url: relativeUrl(href), title, thumbnailUrl: this.lazySrc(cover?.selectFirst('img')) }];
  }

  lazySrc(img: HtmlElement | null | undefined): string | undefined {
    if (!img) return undefined;
    const lazy = img.absUrl('data-lazy-src');
    if (lazy) return lazy;
    const srcset = img.attr('data-lazy-srcset');
    if (srcset) return srcset.split(',')[0]?.trim().split(' ')[0];
    const src = img.absUrl('src');
    return src && !src.startsWith('data:') ? src : undefined;
  }

  absolute(url: string): string {
    if (/^https?:\/\//.test(url)) return url;
    return `${this.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  resolveUrl(url: string): MangaSummary | null {
    if (hostOf(url) !== hostOf(this.baseUrl)) return null;
    const slug = /^https?:\/\/[^/]+\/mangas\/([^/?#]+)/i.exec(url)?.[1];
    return slug ? { url: `/mangas/${slug}/`, title: '' } : null;
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return this.absolute(item.url);
  }

  toSource(): Source {
    return {
      baseUrl: this.baseUrl,
      getPopular: (page) => this.getPopular(page),
      getLatest: (page) => this.getLatest(page),
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
