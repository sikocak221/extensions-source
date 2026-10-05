// InitManga (WordPress theme "init-manga"), ported from keiyoushi/extensions-source lib-multisrc/initmanga.
// This directory is a template: every extension using the theme keeps an identical copy in src/initmanga/
// (`node scripts/sync-multisrc.mjs`).
//
// Chapter images come encrypted (AES-CBC, key from PBKDF2-SHA512 of the page's base64 "decryption_key").
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
  Preference,
  Source,
} from '@matane/extension-sdk';
import { pbkdf2Sha512 } from './pbkdf2';
import { USER_AGENT, absoluteUrl, decodeEntities, hostOf, htmlToText, parseDate, relativeUrl } from './utils';

export const HIDE_LOCKED_PREFERENCE: Preference = {
  type: 'switch',
  key: 'pref_hide_locked_chapters',
  label: 'Hide locked chapters',
  description: 'Hide chapters that require coins to read',
  default: false,
};

const option = (label: string, value: string): FilterOption => ({ label, value });

export abstract class InitManga {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;
  mangaUrlDirectory = 'seri';
  chapterPagePathSegment = 'bolum';
  datePattern = "yyyy-MM-dd'T'HH:mm:ss";
  popularUrlSlug = 'seri';
  latestUrlSlug = 'son-guncellemeler';
  labels = {
    genres: 'Kategoriler',
    type: 'Tür',
    status: 'Durum',
    sort: 'Sırala',
    altTitle: 'Alternatif Başlık',
    locked: 'Kilitli bölüm, okumak için siteye giriş yapmanız gerekiyor',
  };
  typeOptions: FilterOption[] = [option('Tüm Türler', ''), option('Çizgi Roman', 'comic'), option('Roman', 'novel')];
  statusOptions: FilterOption[] = [
    option('Tüm Durumlar', ''),
    option('Devam ediyor', 'ongoing'),
    option('Sezon sonu', 'season_end'),
    option('Tamamlandı', 'completed'),
    option('Kaynak ara verdi', 'source_hiatus'),
    option('Güncel', 'caught_up'),
    option('Bırakıldı', 'dropped'),
  ];
  sortOptions: FilterOption[] = [
    option('Son Güncellenen', 'updated'),
    option('En yeni', 'new'),
    option('En Çok Görüntülenme', 'views'),
    option('En Yüksek Puan', 'rating'),
    option('Popülerlik (Güç / Kutsama)', 'power'),
    option('En Çok Takipçi', 'follow'),
  ];

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  async fetchDocument(url: string): Promise<{ body: string; url: string; document: HtmlElement }> {
    const response = await http.get(url, { headers: this.headers() });
    return { body: response.body, url: response.url, document: html.load(response.body, { baseUrl: response.url }) };
  }

  imgAttr(element: HtmlElement | null | undefined): string | undefined {
    if (!element) return undefined;
    for (const name of ['data-original-src', 'data-src', 'data-lazy-src', 'data-cfsrc', 'data-original', 'src']) {
      const value = element.absUrl(name) || element.attr(name)?.trim();
      if (value && !value.startsWith('data:')) return value;
    }
    return undefined;
  }

  popularMangaSelector(): string {
    return (
      'div.manga-card, div.manga-item-grid > div.uk-panel.uk-position-relative, ' +
      'div.manga-item-grid > div.uk-panel:not(.manga-item-ranking):not(.user-item-info), ' +
      'div.uk-panel.uk-position-relative, div.uk-panel:not(.manga-item-ranking):not(.user-item-info)'
    );
  }

  popularMangaNextPageSelector(): string {
    return (
      'head link[rel=next], link[rel=next], ' +
      'ul.uk-pagination li:not(.uk-disabled) a[aria-label="Sonraki sayfa"], ' +
      'ul.uk-pagination li:not(.uk-disabled) a[aria-label="Next page"], ' +
      'ul.uk-pagination li:not(.uk-disabled) a:has([uk-pagination-next]), ' +
      'ul.uk-pagination li#next-link:not(.uk-disabled) a, a:contains(Sonraki sayfa), a:contains(Next page), a.next'
    );
  }

  popularMangaFromElement(element: HtmlElement): MangaSummary | null {
    const link =
      element.selectFirst('h2 a, h3 a, div.uk-overflow-hidden a, a.manga-card-title, div.manga-card-image-wrapper a') ??
      element.selectFirst('a');
    if (!link) return null;
    const title =
      element.selectFirst('h2 a, h3 a, div.manga-overlay-title, h2, h3')?.text() ||
      element.selectFirst('a')?.text() ||
      '';
    return {
      url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
      title,
      thumbnailUrl: this.imgAttr(element.selectFirst('img')),
    };
  }

  parseList(document: HtmlElement, hasNext: boolean): MangaPage {
    const seen = new Set<string>();
    const items = document
      .select(this.popularMangaSelector())
      .map((e) => this.popularMangaFromElement(e))
      .filter(
        (m): m is MangaSummary =>
          m != null && Boolean(m.url && m.title) && !seen.has(m.url) && Boolean(seen.add(m.url)),
      );
    return { items, hasNextPage: hasNext };
  }

  /** "Next" links without own text (the arrow-only pagination). */
  hasNumberedNext(document: HtmlElement, selector = 'ul.uk-pagination li:not(#prev-link) a[href^=http]'): boolean {
    return document
      .select(selector)
      .some((a) => !/\S/.test(htmlToText(a.html().replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, ''))));
  }

  async listPage(slug: string, page: number): Promise<MangaPage> {
    const { document } = await this.fetchDocument(`${this.baseUrl}/${slug}/${page === 1 ? '' : `page/${page}/`}`);
    return this.parseList(document, document.selectFirst(this.popularMangaNextPageSelector()) != null);
  }

  getPopular(page: number): Promise<MangaPage> {
    return this.listPage(this.popularUrlSlug, page);
  }

  getLatest(page: number): Promise<MangaPage> {
    return this.listPage(this.latestUrlSlug, page);
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const q = query.trim();
    if (q) {
      const response = await http.get(
        `${this.baseUrl}/wp-json/initlise/v1/search?term=${encodeURIComponent(q)}&page=${page}`,
        { headers: this.headers() },
      );
      const body = String(response.body).trimStart();
      if (!body) throw new Error('Empty response body');
      if (body.startsWith('<')) {
        const document = html.load(body, { baseUrl: response.url });
        return this.parseList(document, this.hasNumberedNext(document));
      }
      const list = JSON.parse(body) as { title?: string | null; url?: string | null; thumb?: string | null }[];
      return {
        items: list
          .map((m) => ({
            url: relativeUrl(m.url ?? ''),
            title: decodeEntities(htmlToText(m.title ?? '')),
            thumbnailUrl: m.thumb || undefined,
          }))
          .filter((m) => m.url && m.title),
        hasNextPage: false,
      };
    }
    const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');
    const genres = Object.entries(filters)
      .filter(([id, value]) => id.startsWith('genre.') && value === true)
      .map(([id]) => id.slice('genre.'.length));
    if (genres[0]?.startsWith('http')) {
      const { document } = await this.fetchDocument(
        page > 1 ? `${genres[0].replace(/\/+$/, '')}/page/${page}/` : genres[0],
      );
      return this.parseList(document, this.hasNumberedNext(document));
    }
    const params = [
      ...genres.map((g) => `genre[]=${encodeURIComponent(g)}`),
      ...(['type', 'status'] as const).filter((id) => text(id)).map((id) => `${id}=${encodeURIComponent(text(id))}`),
      `sort=${encodeURIComponent(text('sort') || this.sortOptions[0]?.value || '')}`,
    ];
    const { document } = await this.fetchDocument(
      `${this.baseUrl}/${this.mangaUrlDirectory}/${page > 1 ? `page/${page}/` : ''}?${params.join('&')}`,
    );
    return this.parseList(document, document.selectFirst(this.popularMangaNextPageSelector()) != null);
  }

  // Details
  parseStatus(text: string): MangaStatus {
    const value = text.toLowerCase();
    if (value.includes('güncel') || value.includes('devam') || value.includes('ongoing')) return 'ongoing';
    if (
      value.includes('tamamland') ||
      value.includes('bitti') ||
      value.includes('completed') ||
      (value.includes('final') && !value.includes('sezon'))
    )
      return 'completed';
    if (value.includes('ara ver') || value.includes('sezon') || value.includes('hiatus')) return 'hiatus';
    if (value.includes('bırakıldı') || value.includes('iptal') || value.includes('dropped') || value.includes('cancel'))
      return 'cancelled';
    return 'unknown';
  }

  /** Text of `div.manga-info-details` between "<label>:" and the next label. */
  infoText(document: HtmlElement, label: string, next: string): string {
    const text = document
      .select(`div.manga-info-details:contains(${label})`)
      .map((e) => e.text())
      .join(' ');
    return (text.split(`${label}:`)[1] ?? '').split(`${next}:`)[0]!.trim();
  }

  parseMangaDetails(document: HtmlElement, manga: MangaSummary): MangaDetails {
    const descriptionHtml = document.selectFirst('div#manga-description')?.html() ?? '';
    let description = htmlToText(descriptionHtml.replace(/<(a|span)\b[^>]*>[\s\S]*?<\/\1>/gi, '')).trim();
    const alt = document.selectFirst('span#comic-othername')?.text();
    if (alt?.trim()) description += `\n\n${this.labels.altTitle}: ${alt}`;
    let genres = document
      .select('div.uk-flex.uk-flex-nowrap.uk-flex-left.uk-grid-small.uk-grid span.uk-label-contest')
      .map((e) => e.text().replace(/^#/, '').trim());
    if (genres.length === 0) genres = document.select('div#genre-tags a').map((a) => a.text());
    const author =
      document
        .select('div.manga-info-details:contains(Yazar) a')
        .map((a) => a.text())
        .join(' ') || this.infoText(document, 'Yazar', 'Çizer');
    const artist =
      document
        .select('div.manga-info-details:contains(Çizer) a')
        .map((a) => a.text())
        .join(' ') || this.infoText(document, 'Çizer', 'Durum');
    const status =
      document.selectFirst('span#manga-status, div.manga-status-ribbons span.manga-status-ribbon__text')?.text() ??
      document
        .select('div.manga-info-details:contains(Durum)')
        .map((e) => e.text())
        .join(' ')
        .split('Durum:')[1] ??
      '';
    return {
      url: manga.url,
      title: document.selectFirst('h1')?.text() || document.selectFirst('h2.uk-h3')?.text() || manga.title,
      description: description.trim() || undefined,
      genres,
      author: author || undefined,
      artist: artist || undefined,
      status: this.parseStatus(status),
      thumbnailUrl:
        this.imgAttr(document.selectFirst('div.story-cover-wrap img, div.single-thumb img, a.story-cover img')) ??
        manga.thumbnailUrl,
    };
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    return this.parseMangaDetails((await this.fetchDocument(absoluteUrl(this.baseUrl, manga.url))).document, manga);
  }

  // Chapters
  chapterListSelector(): string {
    return 'div.chapter-item';
  }

  isLocked(element: HtmlElement): boolean {
    return (
      element.selectFirst('[uk-icon*=lock], span.uk-text-danger, span.chapter-lock, div.lock-card, i.fa-lock') !=
        null || element.html().includes('icon: lock')
    );
  }

  chapterFromElement(element: HtmlElement): Chapter | null {
    const link = element.selectFirst('a');
    if (!link) return null;
    const raw = element
      .select('h3')
      .map((e) => e.text())
      .join(' ');
    const name = raw.split('–').pop()!.split('-').pop()!.trim() || raw;
    return {
      url: relativeUrl(link.absUrl('href') || link.attr('href') || ''),
      name: this.isLocked(element) && !name.startsWith('🔒') ? `🔒 ${name}` : name,
      uploadedAt: parseDate(element.selectFirst('time')?.attr('datetime'), this.datePattern),
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const mangaUrl = absoluteUrl(this.baseUrl, manga.url).replace(/\/?$/, '/');
    const hideLocked = prefs.get<boolean>(HIDE_LOCKED_PREFERENCE.key) === true;
    const chapters: Chapter[] = [];
    const add = (document: HtmlElement): number => {
      const items = document.select(this.chapterListSelector());
      for (const element of items) {
        if (hideLocked && this.isLocked(element)) continue;
        const chapter = this.chapterFromElement(element);
        if (chapter && !(hideLocked && chapter.name.startsWith('🔒'))) chapters.push(chapter);
      }
      return items.length;
    };
    // The series page shows the first chapters; later ones live at "<series>/<segment>/page/<n>/".
    if (add((await this.fetchDocument(mangaUrl)).document) > 0) {
      for (let page = 2; page < 500; page++) {
        let document: HtmlElement;
        try {
          document = (await this.fetchDocument(`${mangaUrl}${this.chapterPagePathSegment}/page/${page}/`)).document;
        } catch {
          break;
        }
        if (add(document) === 0 || !this.hasNumberedNext(document, 'ul.uk-pagination a[href^=http]')) break;
      }
    }
    const seen = new Set<string>();
    return chapters.filter((c) => !seen.has(c.url) && Boolean(seen.add(c.url)));
  }

  // Pages
  async getPages(chapter: Chapter): Promise<Page[]> {
    const { body, document } = await this.fetchDocument(absoluteUrl(this.baseUrl, chapter.url));
    if (document.selectFirst('div#chapter-content div.lock-card')) throw new Error(this.labels.locked);
    const scripts = document
      .select('script[src*=base64]')
      .map((s) => {
        try {
          return base64.decode((s.attr('src') ?? '').split('base64,')[1]?.replace(/["']+$/, '') ?? '');
        } catch {
          return '';
        }
      })
      .filter(Boolean);
    const payloadJson =
      scripts.map((s) => /InitMangaEncryptedChapter\s*=\s*(\{[\s\S]*?\})/.exec(s)?.[1]).find(Boolean) ??
      /var\s+InitMangaEncryptedChapter\s*=\s*(\{[\s\S]*?\});/.exec(body)?.[1];
    if (payloadJson) {
      try {
        const payload = JSON.parse(payloadJson) as { ciphertext: string; iv: string; salt: string };
        const keyPattern = /["']?decryption_key["']?\s*[:=]\s*["']([^"']+)["']/;
        const rawKey = scripts.map((s) => keyPattern.exec(s)?.[1]).find(Boolean) ?? keyPattern.exec(body)?.[1];
        if (rawKey) {
          const content = (await this.decrypt(payload, base64.decode(rawKey))).trim();
          if (content.startsWith('<') || content.startsWith('[')) return this.parseDecrypted(content);
        }
      } catch (error) {
        log.warn('Cannot decrypt chapter', error);
      }
    }
    return document
      .select(
        'div#chapter-content img, div.chapter-content img, div.reader-area img, div.entry-content img, div#readerarea img',
      )
      .map((img) => this.imgAttr(img))
      .filter((u): u is string => Boolean(u))
      .map((imageUrl, index) => ({ index, imageUrl }));
  }

  async decrypt(payload: { ciphertext: string; iv: string; salt: string }, passphrase: string): Promise<string> {
    const hex = (value: string) => Uint8Array.from(value.match(/../g) ?? [], (b) => Number.parseInt(b, 16));
    const key = await pbkdf2Sha512(new Uint8Array(utf8.encode(passphrase)), hex(payload.salt), 999, 32);
    const plain = crypto.aesDecrypt(base64.decodeBytes(payload.ciphertext), key, { mode: 'cbc', iv: hex(payload.iv) });
    return utf8.decode(Array.from(plain));
  }

  parseDecrypted(content: string): Page[] {
    const urls = content.startsWith('<')
      ? html
          .load(content, { baseUrl: this.baseUrl })
          .select('img')
          .map((img) => this.imgAttr(img))
      : (JSON.parse(content) as string[]).map((src) =>
          src.startsWith('//') ? `https:${src}` : src.startsWith('/') ? absoluteUrl(this.baseUrl, src) : src,
        );
    return urls.filter((u): u is string => Boolean(u)).map((imageUrl, index) => ({ index, imageUrl }));
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  async getFilters(): Promise<Filter[]> {
    const filters: Filter[] = [];
    try {
      const { document } = await this.fetchDocument(`${this.baseUrl}/${this.mangaUrlDirectory}`);
      const box = document.selectFirst(
        "ul.uk-list.uk-text-small, div#uk-tab-3, form.sidebar-manga-filter select[name='genre[]']",
      );
      const genres = (box?.select('li a, a, option') ?? [])
        .map((e) => ({ name: e.text().trim(), url: (e.absUrl('href') || e.attr('value') || '').trim() }))
        .filter((g) => g.url && !/^Türleri/i.test(g.name) && g.name.toLowerCase() !== 'tüm');
      if (genres.length > 0)
        filters.push({
          type: 'group',
          id: 'genre',
          label: this.labels.genres,
          filters: genres.map((g) => ({ type: 'checkbox', id: `genre.${g.url}`, label: g.name })),
        });
    } catch (error) {
      log.warn('Cannot load genres', error);
    }
    filters.push(
      { type: 'select', id: 'type', label: this.labels.type, options: this.typeOptions },
      { type: 'select', id: 'status', label: this.labels.status, options: this.statusOptions },
      { type: 'select', id: 'sort', label: this.labels.sort, options: this.sortOptions },
    );
    return filters;
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/([^/?#]+)\/([^/?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    if (![this.mangaUrlDirectory, 'seri', 'manga'].includes(match[2]!)) return null;
    return { url: `/${this.mangaUrlDirectory}/${match[3]}/`, title: '' };
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
