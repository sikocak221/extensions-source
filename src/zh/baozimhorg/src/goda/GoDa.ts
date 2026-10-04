// GoDa, ported from keiyoushi/extensions-source lib-multisrc/goda. This directory is a template: every
// extension using the theme keeps an identical copy in src/goda/ (`node scripts/sync-multisrc.mjs`).
//
// Manga urls are "/manga/<key>", chapter urls "/manga/<chapter key>#<manga id>/<chapter id>".
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
import { USER_AGENT, decodeEntities, hostOf, ownText } from './utils';

export abstract class GoDa {
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  abstract readonly lang: string;

  userAgent = USER_AGENT;
  enableGenres = true;

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  async fetchDocument(url: string): Promise<HtmlElement> {
    const response = await http.get(url, { headers: this.headers() });
    return html.load(response.body, { baseUrl: response.url });
  }

  key(link: string): string {
    return (link.split('/manga/')[1] ?? link).replace(/\/+$/, '');
  }

  popularMangaUrl(page: number): string {
    return `${this.baseUrl}/hots/page/${page}`;
  }

  latestUpdatesUrl(page: number): string {
    return `${this.baseUrl}/newss/page/${page}`;
  }

  parseList(document: HtmlElement): MangaPage {
    const items = document.select('.container > .cardlist .pb-2 a').map((element) => {
      const src = element.selectFirst('img')?.attr('src') ?? '';
      const proxied = /[?&]url=([^&]+)/.exec(src)?.[1];
      return {
        url: `/manga/${this.key(element.attr('href') ?? '')}`,
        title: ownText(element.selectFirst('h3')),
        thumbnailUrl: (proxied ? decodeURIComponent(proxied) : src) || undefined,
      };
    });
    const next = this.lang === 'zh' ? '下一頁' : 'NEXT';
    return {
      items: items.filter((m) => m.title),
      hasNextPage: document.selectFirst(`a[aria-label=${next}] button`) != null,
    };
  }

  async getPopular(page: number): Promise<MangaPage> {
    return this.parseList(await this.fetchDocument(this.popularMangaUrl(page)));
  }

  async getLatest(page: number): Promise<MangaPage> {
    return this.parseList(await this.fetchDocument(this.latestUpdatesUrl(page)));
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    let url: string;
    if (query.trim()) url = `${this.baseUrl}/s/${encodeURIComponent(query.trim())}?page=${page}`;
    else {
      const genre = typeof filters.genre === 'string' ? filters.genre : '';
      url = genre ? `${this.baseUrl}${genre}/page/${page}` : this.popularMangaUrl(page);
    }
    return this.parseList(await this.fetchDocument(url));
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const document = await this.fetchDocument(`${this.baseUrl}${manga.url}`);
    const main = document.selectFirst('main') ?? document;
    const title = main.selectFirst('h1');
    // The details are the children of the title's grandparent: [title, authors, genres, tags, description].
    const elements = main.selectFirst(':has(> :has(> h1))')?.select(':scope > *') ?? [];
    const children = (el: HtmlElement | undefined) => el?.select(':scope > *') ?? [];
    const statusText = title?.selectFirst(':scope > *')?.text() ?? '';
    const statuses: Record<string, MangaStatus> = {
      連載中: 'ongoing',
      Ongoing: 'ongoing',
      完結: 'completed',
      停止更新: 'cancelled',
      休刊: 'hiatus',
    };
    const mangaId = document.selectFirst('#mangachapters')?.attr('data-mid') ?? '';
    const description = elements[4]?.text() ?? '';
    return {
      url: manga.url,
      title: ownText(title) || manga.title,
      status: statuses[statusText] ?? 'unknown',
      author:
        decodeEntities(
          children(elements[1])
            .slice(1)
            .map((e) => e.text().replace(/ ,$/, ''))
            .join(', '),
        ) || undefined,
      genres: [
        ...children(elements[2])
          .slice(1)
          .map((e) => e.text().replace(/ ,$/, '')),
        ...children(elements[3]).map((e) => e.text().replace(/^#/, '')),
      ].filter(Boolean),
      description: `${description}${mangaId ? `\n\nID: ${mangaId}` : ''}`.trim() || undefined,
      thumbnailUrl: main.selectFirst('img.object-cover')?.attr('src') || manga.thumbnailUrl,
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const page = await this.fetchDocument(`${this.baseUrl}${manga.url}`);
    const mangaId = page.selectFirst('#mangachapters')?.attr('data-mid');
    if (!mangaId) throw new Error('Manga id not found');
    const document = await this.fetchDocument(`${this.baseUrl}/manga/get?mid=${mangaId}&mode=all`);
    return document
      .select('.chapteritem')
      .reverse()
      .flatMap((element): Chapter[] => {
        const anchor = element.selectFirst('a');
        if (!anchor) return [];
        return [
          {
            url: `/manga/${this.key(anchor.attr('href') ?? '')}#${mangaId}/${anchor.attr('data-cs')}`,
            name: anchor.attr('data-ct') ?? '',
          },
        ];
      });
  }

  pageListUrl(mangaId: string, chapterId: string): string {
    return `${this.baseUrl}/chapter/getcontent?m=${mangaId}&c=${chapterId}`;
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const [mangaId = '', chapterId = ''] = (chapter.url.split('#')[1] ?? '').split('/');
    if (!mangaId || !chapterId) throw new Error(this.lang === 'zh' ? '请刷新漫画' : 'Refresh manga');
    const document = await this.fetchDocument(this.pageListUrl(mangaId, chapterId));
    return document
      .select('#chapcontent > div > img')
      .map((img) => img.attr('data-src') || img.attr('src') || '')
      .filter(Boolean)
      .map((imageUrl, index) => ({ index, imageUrl }));
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  async getFilters(): Promise<Filter[]> {
    if (!this.enableGenres) return [];
    try {
      const document = await this.fetchDocument(this.popularMangaUrl(1));
      const box = document.selectFirst(':has(> :has(> h2))');
      const genres = (box?.select('a') ?? [])
        .map((a) => ({ label: a.text().replace(/^#/, ''), value: a.attr('href') ?? '' }))
        .filter((g) => g.value);
      if (genres.length === 0) return [];
      return [
        {
          type: 'header',
          label: this.lang === 'zh' ? '分类（搜索文本时无效）' : 'Filters are ignored when using text search.',
        },
        {
          type: 'select',
          id: 'genre',
          label: this.lang === 'zh' ? '分类' : 'Genre',
          options: [{ label: '-', value: '' }, ...genres],
        },
      ];
    } catch (error) {
      log.warn('Cannot load genres', error);
      return [];
    }
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/manga\/([^/?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: `/manga/${match[2]}`, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return `${this.baseUrl}${item.url.split('#')[0]}`;
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
