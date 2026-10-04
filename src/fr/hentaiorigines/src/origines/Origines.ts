// Origines ("child-origines" WordPress theme, a Madara child theme with rewritten listing, details and chapter
// templates), ported from keiyoushi/extensions-source lib-multisrc/origines. This directory is a template: every
// extension using the theme keeps an identical copy in src/origines/ (`node scripts/sync-multisrc.mjs`).
//
// Like in Tachiyomi only the identifying slugs are stored, so entries survive the series path changing: manga urls
// are "/<slug>", chapter urls "/<slug>/<chapter slug>".
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
import { USER_AGENT, hostOf, selectIgnoreCase } from './utils';

const STATUSES: FilterOption[] = [
  { label: 'Tous', value: 'tous' },
  { label: 'En cours', value: 'en-cours' },
  { label: 'Terminé', value: 'termine' },
];

const RATINGS: FilterOption[] = [
  { label: 'Toutes', value: '0' },
  { label: '1 étoile et plus', value: '1' },
  { label: '2 étoiles et plus', value: '2' },
  { label: '3 étoiles et plus', value: '3' },
  { label: '4 étoiles et plus', value: '4' },
  { label: '5 étoiles', value: '5' },
];

const SORTS: FilterOption[] = [
  { label: 'Récents', value: 'recents' },
  { label: 'Populaire', value: 'populaire' },
  { label: 'Mieux notés', value: 'notes' },
  { label: 'A → Z', value: 'az' },
];

const MONTHS: [string, number][] = [
  ['jan', 1],
  ['fev', 2],
  ['fév', 2],
  ['mar', 3],
  ['avr', 4],
  ['mai', 5],
  ['juin', 6],
  ['juil', 7],
  ['ao', 8],
  ['sep', 9],
  ['oct', 10],
  ['nov', 11],
  ['dec', 12],
  ['déc', 12],
];

export abstract class Origines {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;

  /** Path prefix the entries live under, `<baseUrl>/<mangaPath>/<slug>/`. */
  abstract readonly mangaPath: string;

  /** Prefixes entries used to be served under. Stored urls using them are still resolved. */
  legacyMangaPaths: string[] = [];

  /** Genres of the catalogue panel. */
  abstract readonly genres: FilterOption[];

  /** Origins of the catalogue panel. Empty hides the filter. */
  origins: FilterOption[] = [];

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  // Utilities
  knownPaths(): string[] {
    return [...this.legacyMangaPaths, this.mangaPath];
  }

  pathSegments(url: string): string[] {
    const path = url.replace(/^(?:https?:)?\/\/[^/?#]+/i, '').replace(/[?#].*$/, '');
    return path.split('/').filter((s) => s.trim() !== '' && !this.knownPaths().includes(s));
  }

  toMangaSlug(url: string): string {
    return this.pathSegments(url)[0] ?? url;
  }

  toChapterSlug(url: string): string {
    return this.pathSegments(url).slice(0, 2).join('/');
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    const isChapter = this.pathSegments(item.url).length > 1;
    const path = isChapter ? this.toChapterSlug(item.url) : this.toMangaSlug(item.url);
    return `${this.baseUrl}/${this.mangaPath}/${path}/`;
  }

  async fetchDocument(url: string): Promise<HtmlElement> {
    const response = await http.get(url, { headers: this.headers() });
    return html.load(response.body, { baseUrl: response.url });
  }

  // Catalogue: paging, sorting, filtering and searching all go through one theme action, which answers with a
  // HTML fragment.
  async getCatalogue(
    page: number,
    options: {
      query?: string;
      genres?: string;
      status?: string;
      rating?: string;
      origin?: string;
      sort?: string;
      chapterMin?: string;
      chapterMax?: string;
    } = {},
  ): Promise<MangaPage> {
    const response = await http.post(
      `${this.baseUrl}/wp-admin/admin-ajax.php`,
      {
        form: {
          action: 'madara_child_catalogue',
          s: options.query ?? '',
          genres: options.genres ?? '',
          statut: options.status ?? 'tous',
          note: options.rating ?? '0',
          origine: options.origin ?? '',
          tri: options.sort ?? 'recents',
          chmin: options.chapterMin ?? '0',
          chmax: options.chapterMax ?? '0',
          page: String(page),
          auteur: '',
          artiste: '',
          annee: '',
        },
      },
      { headers: this.headers() },
    );
    const { data } = JSON.parse(response.body) as { data: { html?: string; more?: boolean } };
    const fragment = html.load(data.html ?? '', { baseUrl: this.baseUrl });
    const items = fragment.select('a.ori-card:has(span.ori-card-title)').flatMap((element): MangaSummary[] => {
      const title = element.selectFirst('span.ori-card-title')?.text();
      if (!title) return [];
      return [
        {
          url: `/${this.toMangaSlug(element.attr('href') ?? '')}`,
          title,
          thumbnailUrl: element.selectFirst('img')?.absUrl('src') || undefined,
        },
      ];
    });
    return { items, hasNextPage: data.more ?? false };
  }

  getPopular(page: number): Promise<MangaPage> {
    return this.getCatalogue(page, { sort: 'populaire' });
  }

  getLatest(page: number): Promise<MangaPage> {
    return this.getCatalogue(page, { sort: 'recents' });
  }

  search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');
    const checked = (prefix: string) =>
      Object.entries(filters)
        .filter(([id, v]) => id.startsWith(prefix) && v === true)
        .map(([id]) => id.slice(prefix.length))
        .join(',');
    const count = (id: string) => {
      const value = text(id).trim();
      return value && /^\d+$/.test(value) ? value : '0';
    };
    return this.getCatalogue(page, {
      query,
      genres: checked('genre.'),
      status: text('status') || 'tous',
      rating: text('rating') || '0',
      origin: checked('origin.'),
      sort: text('sort') || 'recents',
      chapterMin: count('chapters_min'),
      chapterMax: count('chapters_max'),
    });
  }

  getFilters(): Filter[] {
    const group = (id: string, label: string, options: FilterOption[]): Filter => ({
      type: 'group',
      id,
      label,
      filters: options.map((o) => ({ type: 'checkbox', id: `${id}.${o.value}`, label: o.label })),
    });
    const filters: Filter[] = [];
    if (this.origins.length > 0) filters.push(group('origin', 'Origine', this.origins));
    filters.push(
      group('genre', 'Genres', this.genres),
      { type: 'select', id: 'status', label: 'Statut', options: STATUSES, default: 'tous' },
      { type: 'select', id: 'rating', label: 'Note minimum', options: RATINGS, default: '0' },
      { type: 'select', id: 'sort', label: 'Trier par', options: SORTS, default: 'recents' },
      { type: 'text', id: 'chapters_min', label: 'Chapitres (min)' },
      { type: 'text', id: 'chapters_max', label: 'Chapitres (max)' },
    );
    return filters;
  }

  // Details
  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const slug = this.toMangaSlug(manga.url);
    const document = await this.fetchDocument(`${this.baseUrl}/${this.mangaPath}/${slug}/`);
    // Each term <dt> is followed by its value element: matched by position (no sibling navigation in the sandbox).
    const terms = document.select('div.ori-sr-infos dt');
    const values = document.select('div.ori-sr-infos dt + *');
    const infos: Record<string, string> = {};
    terms.forEach((dt, i) => (infos[dt.text().toLowerCase()] = values[i]?.text() ?? ''));
    const paragraphs = document.select('div.ori-sr-syn-texte p').map((p) => p.text());
    const alternative = infos['nom alternatif'];
    const description = [paragraphs.join('\n'), alternative?.trim() ? `\nNom alternatif: ${alternative}` : '']
      .join('')
      .trim();
    const genres = [
      ...document.select('div.ori-sr-genres a.ori-sr-genre').map((a) => a.text()),
      infos.type ?? '',
    ].filter((g) => g.trim());
    return {
      url: manga.url,
      title: document.selectFirst('h1.ori-sr-title')?.text() || manga.title,
      thumbnailUrl: document.selectFirst('div.ori-sr-cover img')?.absUrl('src') || manga.thumbnailUrl,
      author: infos.auteur ?? infos['scénario'],
      artist: infos.artiste ?? infos.dessin,
      description: description || undefined,
      genres,
      status: this.toStatus(infos.statut?.toLowerCase()),
    };
  }

  toStatus(text: string | undefined): MangaStatus {
    switch (text) {
      case 'en cours':
        return 'ongoing';
      case 'terminé':
        return 'completed';
      case 'en pause':
        return 'hiatus';
      case 'abandonné':
      case 'annulé':
        return 'cancelled';
      default:
        return 'unknown';
    }
  }

  // Chapters
  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const slug = this.toMangaSlug(manga.url);
    const response = await http.post(
      `${this.baseUrl}/${this.mangaPath}/${slug}/ajax/chapters/`,
      { form: {} },
      { headers: { ...this.headers(), 'X-Requested-With': 'XMLHttpRequest' } },
    );
    const document = html.load(response.body, { baseUrl: this.baseUrl });
    return document.select('div.ori-chl-row').flatMap((row): Chapter[] => {
      const link = row.selectFirst('a.ori-chl-corps');
      if (!link) return [];
      return [
        {
          url: `/${this.toChapterSlug(link.attr('href') ?? '')}`,
          name: row.selectFirst('span.ori-chl-nom')?.text() || link.text(),
          uploadedAt: this.parseChapterDate(row.selectFirst('span.ori-chl-date')?.attr('title')),
        },
      ];
    });
  }

  /** Dates can read `8 Août 2026` or `8 Août`. The latter uses the most recent matching year. */
  parseChapterDate(date: string | undefined | null): number | undefined {
    const match = /(\d{1,2})\s+(\p{L}+)\.?(?:\s+(\d{4}))?/u.exec(date ?? '');
    if (!match) return undefined;
    const name = match[2]!.toLowerCase();
    const month = MONTHS.find(([prefix]) => name.startsWith(prefix))?.[1];
    if (!month) return undefined;
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    let time = Date.UTC(match[3] ? Number(match[3]) : now.getUTCFullYear(), month - 1, Number(match[1]));
    if (!match[3] && time > today) time = Date.UTC(now.getUTCFullYear() - 1, month - 1, Number(match[1]));
    return Number.isNaN(time) ? undefined : time;
  }

  // Pages
  async getPages(chapter: Chapter): Promise<Page[]> {
    const document = await this.fetchDocument(
      `${this.baseUrl}/${this.mangaPath}/${this.toChapterSlug(chapter.url)}/?style=list`,
    );
    return document.select('div.reading-content img.wp-manga-chapter-img').map((img, index) => ({
      index,
      imageUrl: (img.attr('data-src') !== undefined ? img.absUrl('data-src') : img.absUrl('src'))?.trim(),
    }));
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  resolveUrl(url: string): MangaSummary | null {
    if (hostOf(url) !== hostOf(this.baseUrl)) return null;
    const path = url.replace(/^(?:https?:)?\/\/[^/?#]+/i, '').replace(/[?#].*$/, '');
    if (!this.knownPaths().includes(path.split('/').filter(Boolean)[0] ?? '')) return null;
    const slug = this.toMangaSlug(path);
    return slug ? { url: `/${slug}`, title: '' } : null;
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
