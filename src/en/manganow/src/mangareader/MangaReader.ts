// MangaReader, ported from keiyoushi/extensions-source lib-multisrc/mangareader. This directory is a template:
// every extension using the theme keeps an identical copy in src/mangareader/ (`node scripts/sync-multisrc.mjs`).
//
// Chapter urls are "<path>#<chapter id>" (the id feeds the image ajax endpoint).
import type {
  Chapter,
  Filter,
  FilterOption,
  FilterState,
  HtmlElement,
  MangaDetails,
  MangaPage,
  MangaStatus,
  MangaSummary,
  Page,
  Source,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, imgAttr, ownText, relativeUrl, withQuery } from './utils';

export abstract class MangaReader {
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  abstract readonly lang: string;

  userAgent = USER_AGENT;
  sortPopularValue = 'most-viewed';
  sortLatestValue = 'latest-updated';
  searchPathSegment = 'search';
  searchKeyword = 'keyword';
  sortFilterParam = 'sort';
  chapterIdSelect = 'en-chapters';
  imageAttributes = ['data-lazy-src', 'data-src', 'data-url', 'src'];

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  async fetchDocument(url: string): Promise<HtmlElement> {
    const response = await http.get(url, { headers: this.headers() });
    return html.load(response.body, { baseUrl: response.url });
  }

  getPopular(page: number): Promise<MangaPage> {
    return this.search('', page, { [this.sortFilterParam]: this.sortPopularValue });
  }

  getLatest(page: number): Promise<MangaPage> {
    return this.search('', page, { [this.sortFilterParam]: this.sortLatestValue });
  }

  /** Filter ids are the query parameter names; groups of checkboxes use "<param>.<value>" child ids. */
  multiSelectJoin: Record<string, string | undefined> = {};

  searchMangaUrl(page: number, query: string, filters: FilterState): string {
    const q = query.trim();
    if (q)
      return withQuery(`${this.baseUrl}${this.searchPathSegment ? `/${this.searchPathSegment}` : ''}`, {
        [this.searchKeyword]: q,
        page: String(page),
      });
    const params: string[] = [];
    const groups: Record<string, string[]> = {};
    for (const [id, value] of Object.entries(filters)) {
      const dot = id.indexOf('.');
      if (dot > 0 && value === true) (groups[id.slice(0, dot)] ??= []).push(id.slice(dot + 1));
      else if (typeof value === 'string' && value)
        params.push(`${encodeURIComponent(id)}=${encodeURIComponent(value)}`);
    }
    for (const [param, values] of Object.entries(groups)) {
      const join = this.multiSelectJoin[param];
      if (join == null) for (const v of values) params.push(`${encodeURIComponent(param)}=${encodeURIComponent(v)}`);
      else params.push(`${encodeURIComponent(param)}=${encodeURIComponent(values.join(join))}`);
    }
    params.push(`page=${page}`);
    return `${this.baseUrl}/filter/?${params.join('&')}`;
  }

  searchMangaSelector(): string {
    return '.manga_list-sbs .manga-poster';
  }

  searchMangaNextPageSelector(): string {
    return 'ul.pagination > li.active + li';
  }

  searchMangaFromElement(element: HtmlElement): MangaSummary {
    const img = element.selectFirst('img');
    return {
      url: relativeUrl(element.attr('href') ?? ''),
      title: img?.attr('alt') ?? '',
      thumbnailUrl: imgAttr(img, this.imageAttributes) || undefined,
    };
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const document = await this.fetchDocument(this.searchMangaUrl(page, query, filters));
    const items = document
      .select(this.searchMangaSelector())
      .map((e) => this.searchMangaFromElement(e))
      .filter((m) => m.url && m.title);
    return { items, hasNextPage: document.selectFirst(this.searchMangaNextPageSelector()) != null };
  }

  getStatus(text: string | undefined): MangaStatus {
    const statuses: Record<string, MangaStatus> = {
      ongoing: 'ongoing',
      publishing: 'ongoing',
      releasing: 'ongoing',
      completed: 'completed',
      finished: 'completed',
      'on-hold': 'hiatus',
      on_hiatus: 'hiatus',
      canceled: 'cancelled',
      discontinued: 'cancelled',
    };
    return statuses[text?.toLowerCase() ?? ''] ?? 'unknown';
  }

  mangaDetailsParse(document: HtmlElement, manga: MangaSummary): MangaDetails {
    const details: MangaDetails = { url: manga.url, title: manga.title, status: 'unknown' };
    const root = document.selectFirst('#ani_detail');
    if (!root) return details;
    details.title = ownText(root.selectFirst('.manga-name')) || manga.title;
    details.thumbnailUrl = imgAttr(root.selectFirst('img'), this.imageAttributes) || manga.thumbnailUrl;
    details.genres = root.select('.genres > a').map((a) => ownText(a));
    const alt = ownText(root.selectFirst('.manga-name-or'));
    details.description =
      `${ownText(root.selectFirst('.description'))}\n\n${alt && alt !== details.title ? `Alternative Title: ${alt}` : ''}`.trim() ||
      undefined;
    const authorText = this.lang === 'ja' ? '著者:' : 'Authors:';
    const statusText = this.lang === 'ja' ? '地位:' : 'Status:';
    for (const info of root.select('.anisc-info > .item')) {
      const head = ownText(info.selectFirst('.item-head'));
      if (head === statusText) details.status = this.getStatus(info.selectFirst('.name')?.text());
      else if (head === authorText) {
        // "Name (Art)" marks artists; the role follows each link as text.
        const authors: string[] = [];
        const artists: string[] = [];
        const parts = info.html().split(/<a\b/i).slice(1);
        for (const part of parts) {
          const name = html
            .load(`<a${part.split(/<\/a>/i)[0]}</a>`)
            .text()
            .replace(/,/g, '')
            .trim();
          const after = part.split(/<\/a>/i)[1] ?? '';
          (parts.length > 1 && after.includes('(Art)') ? artists : authors).push(name);
        }
        if (authors.length) details.author = authors.join(', ');
        if (artists.length) details.artist = artists.join(', ');
      }
    }
    return details;
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    return this.mangaDetailsParse(await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url)), manga);
  }

  chapterFromElement(element: HtmlElement): Chapter | null {
    const link = element.selectFirst('a');
    if (!link) return null;
    return {
      url: `${relativeUrl(link.attr('href') ?? '')}#${element.attr('data-id') ?? ''}`,
      name: link.selectFirst('.name')?.text() || link.text(),
    };
  }

  /** Async: long lists yield every 300 items (the sandbox stops code that runs > 2 s straight). */
  async chapterListParse(document: HtmlElement): Promise<Chapter[]> {
    const chapters: Chapter[] = [];
    const items = document.select(`#${this.chapterIdSelect} > li.chapter-item`);
    await timers.sleep(0);
    for (let i = 0; i < items.length; i++) {
      const chapter = this.chapterFromElement(items[i]!);
      if (chapter) chapters.push(chapter);
      if (i % 300 === 299) await timers.sleep(0);
    }
    return chapters;
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    return this.chapterListParse(await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url)));
  }

  getAjaxUrl(id: string): string {
    return `${this.baseUrl}/ajax/image/list/${id}?mode=vertical`;
  }

  pageListParseSelector(): string {
    return '.container-reader-chapter > div > img';
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const path = chapter.url.split('#')[0]!;
    let chapterId = chapter.url.split('#')[1] ?? '';
    if (!chapterId) {
      const document = await this.fetchDocument(absoluteUrl(this.baseUrl, path));
      chapterId = document.selectFirst('div[data-reading-id]')?.attr('data-reading-id') ?? '';
      if (!chapterId) throw new Error('Unable to retrieve chapter id');
    }
    const response = await http.get<{ html: string }>(this.getAjaxUrl(chapterId), {
      headers: {
        ...this.headers(),
        Accept: 'application/json, text/javascript, */*; q=0.01',
        Referer: absoluteUrl(this.baseUrl, path),
        'X-Requested-With': 'XMLHttpRequest',
      },
      responseType: 'json',
    });
    const document = html.load(response.body.html, { baseUrl: this.baseUrl });
    return document
      .select(this.pageListParseSelector())
      .map((el) => imgAttr(el, this.imageAttributes) || imgAttr(el.selectFirst('img'), this.imageAttributes))
      .filter(Boolean)
      .map((imageUrl, index) => ({ index, imageUrl }));
  }

  // The original sends each image's own url as Referer; hosts accept no Referer too, but not the site's.
  imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.userAgent };
  }

  sortFilterValues(): FilterOption[] {
    return [
      { label: 'Default', value: 'default' },
      { label: 'Latest Updated', value: this.sortLatestValue },
      { label: 'Score', value: 'score' },
      { label: 'Name A-Z', value: 'name-az' },
      { label: 'Release Date', value: 'release-date' },
      { label: 'Most Viewed', value: this.sortPopularValue },
    ];
  }

  getSortFilter(): Filter {
    return {
      type: 'select',
      id: this.sortFilterParam,
      label: this.lang === 'ja' ? '選別' : 'Sort',
      options: this.sortFilterValues(),
    };
  }

  getFilters(): Filter[] {
    return [this.getSortFilter()];
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)(\/[^?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: match[2]!, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return absoluteUrl(this.baseUrl, item.url.split('#')[0]!);
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
