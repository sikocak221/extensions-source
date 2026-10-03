// EroMuse, ported from keiyoushi/extensions-source lib-multisrc/eromuse. This directory is a template:
// every extension using the theme keeps an identical copy in src/eromuse/ (`node scripts/sync-multisrc.mjs`).
//
// The sites nest albums (collection → author → comic → issue). Browsing walks them with a stack of pages
// kept on the instance: page 1 resets it, later pages pop the next album or listing page.
import type {
  Chapter,
  Filter,
  FilterOption,
  FilterState,
  HtmlElement,
  MangaDetails,
  MangaPage,
  MangaSummary,
  Page,
  Source,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, relativeUrl, withQuery } from './utils';

export const VARIOUS_AUTHORS = 0;
export const AUTHOR = 1;
export const SEARCH_RESULTS_OR_BASE = 2;

/** [label, path segments, page type] */
export type Album = [string, string, number];

interface StackItem {
  url: string;
  pageType: number;
}

interface Doc {
  url: string;
  document: HtmlElement;
}

export abstract class EroMuse {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;
  albumSelector = 'a.c-tile:has(img):not(:has(.members-only))';
  topLevelPathSegment = 'comics/album';
  nextPageSelector = '.pagination span.current + span a';
  linkedChapterSelector = 'a.c-tile:has(img)[href*="/comics/album/"]';
  pageThumbnailSelector = 'a.c-tile:has(img)[href*="/comics/picture/"] img';
  pageThumbnailPathSegment = '/th/';
  pageFullSizePathSegment = '/fl/';
  authorBreadcrumb = {
    author: 'div.top-menu-breadcrumb li:nth-child(2)',
    various: 'div.top-menu-breadcrumb li:nth-child(3)',
  };
  genreSelector: string | null = null;

  protected pageStack: StackItem[] = [];
  protected stackItem: StackItem = { url: '', pageType: AUTHOR };
  protected currentSortingMode = '';

  abstract albums(): Album[];
  abstract sorts(): FilterOption[];

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  async fetchDoc(url: string): Promise<Doc> {
    const response = await http.get(url, { headers: this.headers() });
    return { url: response.url, document: html.load(response.body, { baseUrl: response.url }) };
  }

  imgAttr(img: HtmlElement | null | undefined): string {
    if (!img) return '';
    return (
      (img.attr('data-src') ? img.absUrl('data-src') : img.absUrl('src')) ||
      img.attr('data-src') ||
      img.attr('src') ||
      ''
    );
  }

  nextPageOrNull({ url, document }: Doc): string | null {
    const next = Number.parseInt(document.selectFirst(this.nextPageSelector)?.text() ?? '', 10);
    if (Number.isNaN(next)) return null;
    if (/page=\d+/.test(url)) return url.replace(/page=\d+/, `page=${next}`);
    const [path = '', query] = url.split('?');
    const segments = path.replace(/\/+$/, '').split('/');
    if (/^\d+$/.test(segments[segments.length - 1] ?? '')) segments.pop();
    return `${segments.join('/')}/${next}${query ? `?${query}` : ''}`;
  }

  addNextPageToStack(doc: Doc): void {
    const next = this.nextPageOrNull(doc);
    if (next) this.pageStack.push({ url: next, pageType: this.stackItem.pageType });
  }

  albumType(url: string, fallback = AUTHOR): number {
    return (
      this.albums().find(
        ([, path, type]) => type !== SEARCH_RESULTS_OR_BASE && path && url.toLowerCase().includes(path.toLowerCase()),
      )?.[2] ?? fallback
    );
  }

  mangaFromElement(element: HtmlElement): MangaSummary {
    return {
      url: relativeUrl(element.attr('href') ?? ''),
      title: element.text(),
      thumbnailUrl: this.imgAttr(element.selectFirst('img')) || undefined,
    };
  }

  stackUrl(): string {
    this.stackItem = this.pageStack.pop()!;
    const { url, pageType } = this.stackItem;
    return pageType === AUTHOR && this.currentSortingMode && !url.includes('sort')
      ? withQuery(url, { sort: this.currentSortingMode })
      : url;
  }

  async parseManga(doc: Doc): Promise<MangaPage> {
    const pushAlbums = (d: Doc) => {
      const links = d.document
        .select(this.albumSelector)
        .map((a) => a.absUrl('href') || absoluteUrl(this.baseUrl, a.attr('href') ?? ''));
      for (const url of links.reverse()) this.pageStack.push({ url, pageType: AUTHOR });
    };
    const internalParse = async (d: Doc): Promise<MangaSummary[]> => {
      let authorDoc = d;
      if (this.stackItem.pageType === VARIOUS_AUTHORS) {
        pushAlbums(d);
        authorDoc = await this.fetchDoc(this.stackUrl());
      }
      this.addNextPageToStack(authorDoc);
      return authorDoc.document.select(this.albumSelector).map((e) => this.mangaFromElement(e));
    };
    if (this.stackItem.pageType === VARIOUS_AUTHORS || this.stackItem.pageType === SEARCH_RESULTS_OR_BASE)
      this.addNextPageToStack(doc);
    let items: MangaSummary[] = [];
    if (this.stackItem.pageType === VARIOUS_AUTHORS) {
      pushAlbums(doc);
      items = await internalParse(doc);
    } else if (this.stackItem.pageType === AUTHOR) {
      items = await internalParse(doc);
    } else {
      for (const element of doc.document.select(this.albumSelector)) {
        const url = element.absUrl('href') || absoluteUrl(this.baseUrl, element.attr('href') ?? '');
        const depth = url.replace(`${this.baseUrl}/${this.topLevelPathSegment}/`, '').split('/').length;
        const type = this.albumType(url);
        if (type === VARIOUS_AUTHORS && depth <= 2) {
          this.pageStack.push({ url, pageType: depth === 1 ? VARIOUS_AUTHORS : AUTHOR });
          if (items.length === 0) items.push(...(await internalParse(await this.fetchDoc(this.stackUrl()))));
        } else if (type === AUTHOR && depth === 1) {
          this.pageStack.push({ url, pageType: AUTHOR });
          if (items.length === 0) items.push(...(await internalParse(await this.fetchDoc(this.stackUrl()))));
        } else {
          items.push(this.mangaFromElement(element));
        }
      }
    }
    return { items: items.filter((m) => m.url && m.title), hasNextPage: this.pageStack.length > 0 };
  }

  async fetchManga(url: string, page: number, sortingMode: string): Promise<MangaPage> {
    if (page === 1) {
      this.pageStack = [{ url, pageType: VARIOUS_AUTHORS }];
      this.currentSortingMode = sortingMode;
    }
    if (this.pageStack.length === 0) return { items: [], hasNextPage: false };
    return this.parseManga(await this.fetchDoc(this.stackUrl()));
  }

  getPopular(page: number): Promise<MangaPage> {
    return this.fetchManga(`${this.baseUrl}/comics/album/Various-Authors`, page, '');
  }

  getLatest(page: number): Promise<MangaPage> {
    return this.fetchManga(`${this.baseUrl}/comics/album/Various-Authors?sort=date`, page, 'date');
  }

  /** First stack item of a search (page 1). */
  searchStart(query: string, filters: FilterState): StackItem {
    if (query)
      return {
        url: withQuery(`${this.baseUrl}/search`, { q: query, sort: this.currentSortingMode || undefined, page: '1' }),
        pageType: SEARCH_RESULTS_OR_BASE,
      };
    const [, path, type] = this.selectedAlbum(filters);
    return {
      url: withQuery(`${this.baseUrl}/comics/${path}`, {
        sort: this.currentSortingMode || undefined,
        page: type !== AUTHOR ? '1' : undefined,
      }),
      pageType: type,
    };
  }

  selectedAlbum(filters: FilterState): Album {
    const albums = this.albums();
    return albums.find(([, path]) => path === filters.album) ?? albums[0]!;
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    if (page === 1) {
      this.currentSortingMode = typeof filters.sort === 'string' ? filters.sort : (this.sorts()[0]?.value ?? '');
      this.pageStack = [this.searchStart(query.trim(), filters)];
    }
    if (this.pageStack.length === 0) return { items: [], hasNextPage: false };
    return this.parseManga(await this.fetchDoc(this.stackUrl()));
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const { document } = await this.fetchDoc(absoluteUrl(this.baseUrl, manga.url));
    const type = this.albumType(manga.url, -1);
    const author =
      type === AUTHOR
        ? document
            .select(this.authorBreadcrumb.author)
            .map((e) => e.text())
            .join(' ')
        : type === VARIOUS_AUTHORS
          ? document
              .select(this.authorBreadcrumb.various)
              .map((e) => e.text())
              .join(' ')
          : '';
    const title = manga.title || (document.selectFirst('title')?.text() ?? '').split(' | ')[0]!;
    return {
      url: manga.url,
      title,
      thumbnailUrl: this.imgAttr(document.selectFirst(`${this.albumSelector} img`)) || manga.thumbnailUrl,
      author: author || undefined,
      genres: this.genreSelector ? document.select(this.genreSelector).map((a) => a.text()) : undefined,
      status: 'unknown',
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const chapters: Chapter[] = [];
    let doc: Doc | null = await this.fetchDoc(absoluteUrl(this.baseUrl, manga.url));
    // Linked sub-albums are chapters; pictures on the album itself make one more chapter.
    if (doc.document.selectFirst(this.pageThumbnailSelector))
      chapters.push({ url: relativeUrl(doc.url), name: 'Chapter' });
    const linked: Chapter[] = [];
    for (const seen = new Set<string>(); doc && !seen.has(doc.url);) {
      seen.add(doc.url);
      linked.push(
        ...doc.document
          .select(this.linkedChapterSelector)
          .map((a) => ({ url: relativeUrl(a.attr('href') ?? ''), name: a.text() })),
      );
      const next = this.nextPageOrNull(doc);
      doc = next ? await this.fetchDoc(next) : null;
    }
    return [...linked.reverse(), ...chapters];
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const urls: string[] = [];
    const visit = async (start: string): Promise<void> => {
      const nested: string[] = [];
      let doc: Doc | null = await this.fetchDoc(start);
      for (const seen = new Set<string>(); doc && !seen.has(doc.url);) {
        seen.add(doc.url);
        nested.push(
          ...doc.document
            .select(this.linkedChapterSelector)
            .map((a) => a.absUrl('href') || absoluteUrl(this.baseUrl, a.attr('href') ?? '')),
        );
        urls.push(
          ...doc.document
            .select(this.pageThumbnailSelector)
            .map((img) => this.imgAttr(img).replace(this.pageThumbnailPathSegment, this.pageFullSizePathSegment)),
        );
        const next = this.nextPageOrNull(doc);
        doc = next ? await this.fetchDoc(next) : null;
      }
      for (const url of nested) await visit(url);
    };
    await visit(absoluteUrl(this.baseUrl, chapter.url));
    return urls.filter(Boolean).map((imageUrl, index) => ({ index, imageUrl }));
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  getFilters(): Filter[] {
    return [
      { type: 'header', label: 'Text search only combines with sort!' },
      { type: 'separator' },
      {
        type: 'select',
        id: 'album',
        label: 'Album',
        options: this.albums().map(([label, path]) => ({ label, value: path })),
      },
      { type: 'select', id: 'sort', label: 'Sort Order', options: this.sorts() },
    ];
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)(\/comics\/[^?#]+)/i.exec(url.trim());
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
