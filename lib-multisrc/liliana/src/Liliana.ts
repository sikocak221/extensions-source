// Liliana, ported from keiyoushi/extensions-source lib-multisrc/liliana. This directory is a template: every
// extension using the theme keeps an identical copy in src/liliana/ (`node scripts/sync-multisrc.mjs`).
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
import { USER_AGENT, absoluteUrl, hostOf, imgAttr, relativeUrl, withQuery } from './utils';

export abstract class Liliana {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;
  usesPostSearch = false;

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  ajaxHeaders(referer = `${this.baseUrl}/`): Record<string, string> {
    return {
      ...this.headers(),
      Referer: referer,
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
    };
  }

  async fetchDocument(url: string): Promise<HtmlElement> {
    const response = await http.get(url, { headers: this.headers() });
    return html.load(response.body, { baseUrl: response.url });
  }

  popularMangaSelector(): string {
    return 'div#main div.grid > div';
  }

  popularMangaNextPageSelector(): string | null {
    return '.blog-pager > span.pagecurrent + span';
  }

  popularMangaFromElement(element: HtmlElement): MangaSummary {
    const link = element.selectFirst('.text-center a');
    return {
      url: relativeUrl(link?.absUrl('href') || link?.attr('href') || ''),
      title: link?.text() ?? '',
      thumbnailUrl: imgAttr(element.selectFirst('img')) || undefined,
    };
  }

  parseList(document: HtmlElement): MangaPage {
    const next = this.popularMangaNextPageSelector();
    const items = document
      .select(this.popularMangaSelector())
      .map((e) => this.popularMangaFromElement(e))
      .filter((m) => m.url && m.title);
    return { items, hasNextPage: next != null && document.selectFirst(next) != null };
  }

  async getPopular(page: number): Promise<MangaPage> {
    return this.parseList(await this.fetchDocument(`${this.baseUrl}/ranking/week/${page}`));
  }

  async getLatest(page: number): Promise<MangaPage> {
    return this.parseList(await this.fetchDocument(`${this.baseUrl}/all-manga/${page}/?sort=last_update&status=0`));
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const q = query.trim();
    if (q && this.usesPostSearch) {
      const response = await http.post<{ list: { cover: string; name: string; url: string }[] }>(
        `${this.baseUrl}/ajax/search`,
        { form: { search: q } },
        { headers: this.ajaxHeaders(), responseType: 'json' },
      );
      return {
        items: response.body.list.map((m) => ({
          url: relativeUrl(m.url),
          title: m.name,
          thumbnailUrl: absoluteUrl(this.baseUrl, m.cover),
        })),
        hasNextPage: false,
      };
    }
    if (q)
      return this.parseList(await this.fetchDocument(withQuery(`${this.baseUrl}/search/${page}/`, { keyword: q })));
    const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');
    const genres = (state: string) =>
      Object.entries(filters)
        .filter(([id, value]) => id.startsWith('genre.') && value === state)
        .map(([id]) => id.slice('genre.'.length))
        .join(',');
    const url = withQuery(`${this.baseUrl}/filter/${page}/`, {
      genres: genres('include'),
      notGenres: genres('exclude'),
      chapter_count: text('chapter_count'),
      status: text('status'),
      sex: text('sex'),
      sort: text('sort'),
    });
    return this.parseList(await this.fetchDocument(url));
  }

  async getFilters(): Promise<Filter[]> {
    let document: HtmlElement;
    try {
      document = await this.fetchDocument(`${this.baseUrl}/filter`);
    } catch (error) {
      log.warn('Cannot load filters', error);
      return [];
    }
    const filters: Filter[] = [{ type: 'header', label: 'NOTE: Ignored if using text search!' }, { type: 'separator' }];
    const genres = document
      .select('div.advanced-genres > div > .advance-item')
      .map((el) => ({ label: el.text(), value: el.selectFirst('span')?.attr('data-genre') ?? '' }));
    if (genres.length > 0) {
      filters.push({
        type: 'group',
        id: 'genre',
        label: document.selectFirst('div.advanced-genres > h3')?.text() || 'Genres',
        filters: genres.map((g) => ({ type: 'tristate', id: `genre.${g.value}`, label: g.label })),
      });
    }
    for (const [id, select] of [
      ['chapter_count', 'select-count'],
      ['status', 'select-status'],
      ['sex', 'select-gender'],
      ['sort', 'select-sort'],
    ] as const) {
      const options = document
        .select(`#${select} > option`)
        .map((o) => ({ label: o.text(), value: o.attr('value') ?? '' }));
      if (options.length > 0)
        filters.push({
          type: 'select',
          id,
          label: document.selectFirst(`.select-div > label.${select}`)?.text() || id,
          options,
        });
    }
    return filters;
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url));
    const statuses: Record<string, MangaStatus> = {
      ongoing: 'ongoing',
      'đang tiến hành': 'ongoing',
      進行中: 'ongoing',
      completed: 'completed',
      'hoàn thành': 'completed',
      完了: 'completed',
      'on-hold': 'hiatus',
      'tạm ngưng': 'hiatus',
      保留: 'hiatus',
      canceled: 'cancelled',
      'đã huỷ': 'cancelled',
      キャンセル: 'cancelled',
    };
    const author = document.selectFirst('div.y6x11p i.fas.fa-user + span.dt')?.text();
    return {
      url: manga.url,
      title: document.selectFirst('.a2 header h1')?.text() || manga.title,
      description: document.selectFirst('div#syn-target')?.text() || undefined,
      thumbnailUrl: imgAttr(document.selectFirst('.a1 > figure img')) || manga.thumbnailUrl,
      genres: document.select(".a2 div > a[rel='tag'].label").map((a) => a.text()),
      author: author && author.toLowerCase() !== 'updating' ? author : undefined,
      status:
        statuses[document.selectFirst('div.y6x11p i.fas.fa-rss + span.dt')?.text().toLowerCase() ?? ''] ?? 'unknown',
    };
  }

  chapterListSelector(): string {
    return 'ul > li.chapter';
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const document = await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url));
    return document.select(this.chapterListSelector()).flatMap((element): Chapter[] => {
      const link = element.selectFirst('a');
      if (!link) return [];
      const time = Number(element.selectFirst('time[datetime]')?.attr('datetime'));
      return [
        {
          url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
          name: link.text(),
          uploadedAt: time ? time * 1000 : undefined,
        },
      ];
    });
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const chapterUrl = absoluteUrl(this.baseUrl, chapter.url);
    const body = (await http.get(chapterUrl, { headers: this.headers() })).body;
    const chapterId = /const CHAPTER_ID = ([^;]+);/
      .exec(body)?.[1]
      ?.trim()
      .replace(/^['"]|['"]$/g, '');
    if (!chapterId) throw new Error('Failed to get chapter id');
    const data = (
      await http.get<{ status?: boolean; msg?: string | null; html: string }>(
        `${this.baseUrl}/ajax/image/list/chap/${chapterId}`,
        {
          headers: this.ajaxHeaders(chapterUrl),
          responseType: 'json',
        },
      )
    ).body;
    if (!data.status) throw new Error(data.msg ?? 'Unknown error');
    return this.pageListParse(html.load(data.html, { baseUrl: chapterUrl }));
  }

  pageListParse(document: HtmlElement): Page[] {
    const isImage = (url: string) => {
      const lower = url.toLowerCase();
      return !lower.split(/[?#]/)[0]!.endsWith('.svg') && !lower.includes('loading_comments');
    };
    const indexed = document.select('div.separator[data-index]');
    if (indexed.length === 0) {
      return document
        .select('div.separator a')
        .map((a) => a.absUrl('href') || a.attr('href') || '')
        .filter((url) => url && isImage(url))
        .map((imageUrl, index) => ({ index, imageUrl }));
    }
    return indexed
      .flatMap((el) => {
        const a = el.selectFirst('a');
        const url = a?.absUrl('href') || a?.attr('href') || '';
        return url && isImage(url) ? [{ order: Number(el.attr('data-index')), url }] : [];
      })
      .sort((a, b) => a.order - b.order)
      .map((p, index) => ({ index, imageUrl: p.url }));
  }

  imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Accept: 'image/avif,image/webp,*/*' };
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/manga\/([^/?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: `/manga/${match[2]}`, title: '' };
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
