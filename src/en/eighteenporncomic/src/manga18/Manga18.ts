// Manga18, ported from keiyoushi/extensions-source lib-multisrc/manga18. This directory is a template:
// every extension using the theme keeps an identical copy in src/manga18/ (`node scripts/sync-multisrc.mjs`).
import type {
  Chapter,
  Filter,
  FilterState,
  HtmlElement,
  MangaDetails,
  MangaPage,
  MangaSummary,
  Page,
  Source,
} from '@matane/extension-sdk';
import { USER_AGENT, absoluteUrl, hostOf, parseDate, relativeUrl, selectIgnoreCase, withQuery } from './utils';

export abstract class Manga18 {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;
  datePattern = 'dd-MM-yyyy';
  tagsSelector = 'div.grid_cate li > a';

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  async fetchDocument(url: string): Promise<HtmlElement> {
    const response = await http.get(url, { headers: this.headers() });
    return html.load(response.body, { baseUrl: response.url });
  }

  popularMangaSelector(): string {
    return 'div.story_item';
  }

  popularMangaNextPageSelector(): string {
    return '.pagination > li:last-child:not(.active)';
  }

  popularMangaFromElement(element: HtmlElement): MangaSummary {
    const link = element.selectFirst('a');
    return {
      url: relativeUrl(link?.absUrl('href') || link?.attr('href') || ''),
      title: element.selectFirst('div.mg_info > div.mg_name a')?.text() ?? '',
      thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined,
    };
  }

  parseList(document: HtmlElement): MangaPage {
    const items = document
      .select(this.popularMangaSelector())
      .map((e) => this.popularMangaFromElement(e))
      .filter((m) => m.url && m.title);
    return { items, hasNextPage: document.selectFirst(this.popularMangaNextPageSelector()) != null };
  }

  async getPopular(page: number): Promise<MangaPage> {
    return this.parseList(await this.fetchDocument(`${this.baseUrl}/list-manga/${page}?order_by=views`));
  }

  async getLatest(page: number): Promise<MangaPage> {
    return this.parseList(await this.fetchDocument(`${this.baseUrl}/list-manga/${page}`));
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const tag = typeof filters.tag === 'string' ? filters.tag : '';
    const sort = typeof filters.sort === 'string' ? filters.sort : '';
    const url =
      query.trim() || !tag
        ? withQuery(`${this.baseUrl}/list-manga/${page}`, { search: query.trim() })
        : withQuery(`${this.baseUrl}/manga-list/${tag}/${page}`, { order_by: sort || undefined });
    return this.parseList(await this.fetchDocument(url));
  }

  async getFilters(): Promise<Filter[]> {
    let tags: { label: string; value: string }[] = [];
    try {
      const document = await this.fetchDocument(`${this.baseUrl}/list-manga/1`);
      tags = document
        .select(this.tagsSelector)
        .map((a) => ({ label: a.text(), value: (a.attr('href') ?? '').replace(/\/+$/, '').split('/').pop() ?? '' }));
    } catch (error) {
      log.warn('Cannot load tags', error);
    }
    if (tags.length === 0) return [];
    return [
      { type: 'header', label: 'Ignored with text search' },
      { type: 'separator' },
      {
        type: 'select',
        id: 'sort',
        label: 'Sort',
        options: [
          { label: 'Latest', value: '' },
          { label: 'Views', value: 'views' },
          { label: 'A-Z', value: 'name' },
        ],
      },
      { type: 'select', id: 'tag', label: 'Tags', options: [{ label: '', value: '' }, ...tags] },
    ];
  }

  // Details and chapters come from the same page.
  infoElementSelector = 'div.detail_listInfo';
  titleSelector = 'div.detail_name > h1';
  descriptionSelector = 'div.detail_reviewContent';
  statusSelector = 'div.item:contains(Status) div.info_value';
  altNameSelector = 'div.item:contains(Other name) div.info_value';
  genreSelector = 'div.info_value > a[href*="/manga-list/"]';
  authorSelector = 'div.info_label:contains(author) + div.info_value, div.info_label:contains(autor) + div.info_value';
  artistSelector = 'div.info_label:contains(artist) + div.info_value';
  thumbnailSelector = 'div.detail_avatar > img';

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url));
    const info = document.selectFirst(this.infoElementSelector) ?? document;
    const value = (selector: string) => {
      const text = selectIgnoreCase(info, selector)[0]?.text();
      return text && text !== 'Updating' ? text : undefined;
    };
    let description = document
      .select(this.descriptionSelector)
      .map((el) => el.text())
      .join('\n\n');
    const alt = value(this.altNameSelector);
    if (alt) description += `${description ? '\n\n' : ''}Alternative Names:\n${alt}`;
    const status = selectIgnoreCase(info, this.statusSelector)
      .map((el) => el.text())
      .join(' ');
    return {
      url: manga.url,
      title:
        document
          .select(this.titleSelector)
          .map((el) => el.text())
          .join(' ') || manga.title,
      description: description || undefined,
      status: status === 'On Going' ? 'ongoing' : status === 'Completed' ? 'completed' : 'unknown',
      author: value(this.authorSelector),
      artist: value(this.artistSelector),
      genres: info.select(this.genreSelector).map((a) => a.text()),
      thumbnailUrl: document.selectFirst(this.thumbnailSelector)?.absUrl('src') || manga.thumbnailUrl,
    };
  }

  chapterListSelector(): string {
    return 'div.chapter_box .item';
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url));
    return document.select(this.chapterListSelector()).flatMap((element): Chapter[] => {
      const link = element.selectFirst('a');
      if (!link) return [];
      return [
        {
          url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
          name: link.text(),
          uploadedAt: parseDate(element.selectFirst('p')?.text(), this.datePattern),
        },
      ];
    });
  }

  // Pages: base64 urls in a "slides_p_path" script.
  async getPages(chapter: Chapter): Promise<Page[]> {
    const body = (await http.get(absoluteUrl(this.baseUrl, chapter.url), { headers: this.headers() })).body;
    const script = html
      .load(body)
      .select('script')
      .map((s) => s.html())
      .find((data) => data.includes('slides_p_path'));
    if (!script) throw new Error('Unable to find script with image data');
    const list = script.slice(script.indexOf('[') + 1).split(',]')[0] ?? '';
    return list
      .replace(/"/g, '')
      .split(',')
      .filter(Boolean)
      .map((encoded, index) => {
        const url = base64.decode(encoded.trim());
        return { index, imageUrl: url.startsWith('/') ? `${this.baseUrl}${url}` : url };
      });
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)(\/(?:manhwa|comic|manga)\/[^/?#]+)/i.exec(url.trim());
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
