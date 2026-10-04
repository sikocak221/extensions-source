// FoOlSlide, ported from keiyoushi/extensions-source lib-multisrc/foolslide. This directory is a template:
// every extension using the theme keeps an identical copy in src/foolslide/ (`node scripts/sync-multisrc.mjs`).
import type {
  Chapter,
  HtmlElement,
  MangaDetails,
  MangaPage,
  MangaSummary,
  Page,
  Preference,
  Source,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, decodeEntities, hostOf, parseDate, relativeUrl } from './utils';

export const ADULT_PREFERENCE: Preference = {
  type: 'switch',
  key: 'adult',
  label: 'Show adult content',
  default: true,
};

export abstract class FoolSlide {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;
  /** Path of the reader on the site (e.g. "/reader"). */
  urlModifier = '';

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  async fetchDocument(url: string): Promise<HtmlElement> {
    const response = await http.get(url, { headers: this.headers() });
    return html.load(response.body, { baseUrl: response.url });
  }

  /** Series and chapter pages behind the adult warning: POST adult=true (unless turned off). */
  async fetchAdult(url: string): Promise<{ body: string; document: HtmlElement }> {
    const response =
      prefs.get<boolean>(ADULT_PREFERENCE.key) === false
        ? await http.get(url, { headers: this.headers() })
        : await http.post(url, { form: { adult: 'true' } }, { headers: this.headers() });
    return { body: response.body, document: html.load(response.body, { baseUrl: response.url }) };
  }

  mangaFromElement(element: HtmlElement, withCover: boolean): MangaSummary {
    const link = element.selectFirst('a[title]');
    const img = element.selectFirst('img');
    return {
      url: relativeUrl(link?.attr('href') ?? ''),
      title: link?.text() ?? '',
      thumbnailUrl: withCover && img ? (img.absUrl('src') || '').replace('/thumb_', '/') || undefined : undefined,
    };
  }

  parseList(document: HtmlElement, nextSelector: string | null, withCover: boolean): MangaPage {
    const items = document
      .select('div.group')
      .map((e) => this.mangaFromElement(e, withCover))
      .filter((m) => m.url && m.title);
    return { items, hasNextPage: nextSelector != null && document.selectFirst(nextSelector) != null };
  }

  async getPopular(page: number): Promise<MangaPage> {
    return this.parseList(
      await this.fetchDocument(`${this.baseUrl}${this.urlModifier}/directory/${page}/`),
      'div.next',
      true,
    );
  }

  async getLatest(page: number): Promise<MangaPage> {
    return this.parseList(
      await this.fetchDocument(`${this.baseUrl}${this.urlModifier}/latest/${page}/`),
      'div.next',
      false,
    );
  }

  async search(query: string): Promise<MangaPage> {
    const response = await http.post(
      `${this.baseUrl}${this.urlModifier}/search/`,
      { form: { search: query.trim() } },
      { headers: this.headers() },
    );
    return this.parseList(html.load(response.body, { baseUrl: response.url }), 'a:has(span.next)', true);
  }

  // Details
  mangaDetailsInfoSelector = 'div.info';
  chapterUrlSelector = 'a[title]';
  chapterDateSelector = 'div.meta_r';

  chapterListSelector(): string {
    return 'div.group div.element, div.list div.element';
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const { document } = await this.fetchAdult(absoluteUrl(this.baseUrl, manga.url));
    const details: MangaDetails = {
      url: manga.url,
      title: manga.title || document.selectFirst('h1.title')?.text() || '',
      status: 'unknown',
    };
    // "<b>Author</b>: value" pairs.
    const info = document.selectFirst(this.mangaDetailsInfoSelector)?.html() ?? '';
    for (const match of info.matchAll(/<b>([^<]*)<\/b>\s*:?\s*([^<]*)/gi)) {
      const label = match[1]!.toLowerCase();
      const value = decodeEntities(match[2]!.trim().replace(/^:\s*/, ''));
      if (!value) continue;
      if (label.includes('author') || label.includes('autore')) details.author = value;
      else if (label.includes('artist')) details.artist = value;
      else if (label.includes('synopsis') || label.includes('description') || label.includes('trama'))
        details.description = value;
    }
    details.thumbnailUrl =
      document.selectFirst('div.thumbnail img, table.thumb img')?.absUrl('src') || manga.thumbnailUrl;
    return details;
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const { document } = await this.fetchAdult(absoluteUrl(this.baseUrl, manga.url));
    return document.select(this.chapterListSelector()).flatMap((element): Chapter[] => {
      const link = element.selectFirst(this.chapterUrlSelector);
      if (!link) return [];
      const date = element.selectFirst(this.chapterDateSelector)?.text() ?? '';
      return [
        {
          url: relativeUrl(link.attr('href') ?? ''),
          name: link.text(),
          uploadedAt: this.parseChapterDate(date.split(', ').slice(1).join(', ') || date),
        },
      ];
    });
  }

  parseChapterDate(text: string): number | undefined {
    const value = text.trim().toLowerCase();
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    if (value.startsWith('yesterday')) return day.getTime() - 86_400_000;
    if (value.startsWith('today')) return day.getTime();
    if (value.startsWith('tomorrow')) return day.getTime() + 86_400_000;
    const relative = /^(\d+)\s+(year|yr|month|week|wk|day|hour|hr|minute|min|second|sec)s?\s+ago/.exec(value);
    if (relative) {
      const amount = Number(relative[1]);
      const date = new Date();
      const unit = relative[2]!;
      if (unit === 'year' || unit === 'yr') date.setFullYear(date.getFullYear() - amount);
      else if (unit === 'month') date.setMonth(date.getMonth() - amount);
      else if (unit === 'week' || unit === 'wk') date.setDate(date.getDate() - amount * 7);
      else if (unit === 'day') date.setDate(date.getDate() - amount);
      else if (unit === 'hour' || unit === 'hr') date.setHours(date.getHours() - amount);
      else if (unit === 'minute' || unit === 'min') date.setMinutes(date.getMinutes() - amount);
      else date.setSeconds(date.getSeconds() - amount);
      return date.getTime();
    }
    const clean = text.replace(/(\d)(st|nd|rd|th)\b/, '$1');
    return parseDate(clean, 'yyyy.MM.dd') ?? parseDate(clean, 'dd MMMM, yyyy') ?? parseDate(clean, 'dd MMMM');
  }

  // Pages: "var pages = [...]" in the reader.
  async getPages(chapter: Chapter): Promise<Page[]> {
    const { body } = await this.fetchAdult(absoluteUrl(this.baseUrl, chapter.url));
    const json = body.split('var pages = ')[1]?.split(';')[0];
    if (!json) return [];
    const pages = JSON.parse(json) as { url: string }[];
    return pages.map((page, index) => ({ index, imageUrl: absoluteUrl(this.baseUrl, page.url) }));
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)([^?#]*\/series\/[^/?#]+\/?)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: match[2]!, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return absoluteUrl(this.baseUrl, item.url);
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
