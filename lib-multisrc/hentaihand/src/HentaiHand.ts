// HentaiHand (JSON API), ported from keiyoushi/extensions-source lib-multisrc/hentaihand. This directory is a
// template: every extension using the theme keeps an identical copy in src/hentaihand/
// (`node scripts/sync-multisrc.mjs`).
//
// Manga urls are "/en/comic/<slug>"; the chapter url is "<slug>" (one-shot) or "<slug>/<chapter slug>".
import type {
  Chapter,
  Filter,
  FilterOption,
  FilterState,
  MangaDetails,
  MangaPage,
  MangaStatus,
  MangaSummary,
  Page,
  Preference,
  Source,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf, parseDate } from './utils';

export const LOGIN_PREFERENCES: Preference[] = [
  { type: 'text', key: 'username', label: 'Username', default: '' },
  { type: 'text', key: 'password', label: 'Password', description: 'Stored as plain text.', default: '' },
];

interface NameDto {
  name: string;
}

interface MangaDto {
  slug: string;
  title: string;
  image_url?: string | null;
  artists?: NameDto[] | null;
  authors?: NameDto[] | null;
  tags?: NameDto[] | null;
  relationships?: NameDto[] | null;
  status?: string | null;
  alternative_title?: string | null;
  groups?: NameDto[] | null;
  description?: string | null;
  pages?: number | null;
  category?: NameDto | null;
  language?: NameDto | null;
  parodies?: NameDto[] | null;
  characters?: NameDto[] | null;
  // The details endpoint of one-shot sources doubles as the chapter.
  updated_at?: string | null;
}

interface ChapterDto {
  slug: string;
  name?: string | null;
  added_at?: string | null;
}

interface ListDto {
  data: MangaDto[];
  next_page_url?: string | null;
}

const SORTS: [string, string][] = [
  ['Upload Date', 'uploaded_at'],
  ['Title', 'title'],
  ['Pages', 'pages'],
  ['Favorites', 'favorites'],
  ['Popularity', 'popularity'],
];
const ORDERS: [string, string][] = [
  ['Descending', 'desc'],
  ['Ascending', 'asc'],
];
const DURATIONS: [string, string][] = [
  ['Today', 'day'],
  ['This Week', 'week'],
  ['This Month', 'month'],
  ['This Year', 'year'],
  ['All Time', 'all'],
];
const ATTRIBUTES: [string, string][] = [
  ['Translated', 'translated'],
  ['Speechless', 'speechless'],
  ['Rewritten', 'rewritten'],
];
const STATUSES: [string, string][] = [
  ['Ongoing', 'ongoing'],
  ['Complete', 'complete'],
  ['On Hold', 'onhold'],
  ['Canceled', 'canceled'],
];
/** Text filters whose terms are resolved to ids: filter id, api path, singular name. */
const LOOKUPS: [string, string, string, string][] = [
  ['categories', 'Categories', 'categories', 'category'],
  ['tags', 'Tags', 'tags', 'tag'],
  ['artists', 'Artists', 'artists', 'artist'],
  ['groups', 'Groups', 'groups', 'group'],
  ['characters', 'Characters', 'characters', 'character'],
  ['parodies', 'Parodies', 'parodies', 'parody'],
  ['languages', 'Other Languages', 'languages', 'language'],
];
const QUERY_LOOKUP_URIS = ['tags', 'artists', 'characters'];

const options = (pairs: [string, string][]): FilterOption[] => pairs.map(([label, value]) => ({ label, value }));
const names = (list: NameDto[] | null | undefined): string | undefined =>
  list && list.length > 0 ? list.map((n) => n.name).join(', ') : undefined;

export abstract class HentaiHand {
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  /** True when a comic has a chapter list (false: every comic is a single chapter). */
  abstract readonly chapters: boolean;

  userAgent = USER_AGENT;
  /** Site language ids of the selected language. */
  hhLangId: number[] = [];

  private token = '';
  private tokenUser = '';
  private readonly filterIdCache = new Map<string, number>();
  private readonly queryIdCache = new Map<string, [string, number]>();

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/`, Accept: 'application/json' };
  }

  async authHeaders(): Promise<Record<string, string>> {
    const username = prefs.get<string>('username')?.trim() ?? '';
    const password = prefs.get<string>('password') ?? '';
    if (!username || !password) return this.headers();
    if (!this.token || this.tokenUser !== username) {
      let body: { auth?: { access_token?: string } };
      try {
        body = (
          await http.post<{ auth?: { access_token?: string } }>(
            `${this.baseUrl}/api/login`,
            { json: { username, password, remember_me: true } },
            { headers: this.headers(), responseType: 'json' },
          )
        ).body;
      } catch (error) {
        throw new Error(`Failed to login, check if username and password are correct (${String(error)})`);
      }
      const token = body.auth?.access_token;
      if (!token) throw new Error('Cannot parse login response body');
      this.token = token;
      this.tokenUser = username;
    }
    return { ...this.headers(), Authorization: `Bearer ${this.token}` };
  }

  async api<T>(url: string): Promise<T> {
    return (await http.get<T>(url, { headers: await this.authHeaders(), responseType: 'json' })).body;
  }

  // Listing
  langParams(): [string, string][] {
    return this.hhLangId.map((id, index) => [`languages[${-index - 1}]`, String(id)]);
  }

  url(path: string, params: [string, string][]): string {
    return `${this.baseUrl}/api/${path}?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
  }

  async parsePage(url: string): Promise<MangaPage> {
    const dto = await this.api<ListDto>(url);
    return { items: dto.data.map((m) => this.toSummary(m)), hasNextPage: !!dto.next_page_url };
  }

  getPopular(page: number): Promise<MangaPage> {
    return this.parsePage(
      this.url('comics', [
        ['page', String(page)],
        ['sort', 'popularity'],
        ['order', 'desc'],
        ['duration', 'all'],
        ...this.langParams(),
      ]),
    );
  }

  getLatest(page: number): Promise<MangaPage> {
    return this.parsePage(
      this.url('comics', [
        ['page', String(page)],
        ['sort', 'uploaded_at'],
        ['order', 'desc'],
        ['duration', 'all'],
        ...this.langParams(),
      ]),
    );
  }

  /** Id of a filter term; the exact match when present, else the first match (or null without results). */
  async lookupFilterId(query: string, uri: string, exactMatchOnly = false): Promise<number | null> {
    const key = `${uri}:${query}`;
    if (!exactMatchOnly) {
      const cached = this.filterIdCache.get(key);
      if (cached !== undefined) return cached;
    }
    const results = (await this.api<{ data: { id: number; name: string }[] }>(this.url(uri, [['q', query]]))).data;
    if (results.length === 0) return null;
    const exact = results.find((r) => r.name.toLowerCase() === query.toLowerCase())?.id;
    if (exactMatchOnly) return exact ?? null;
    const id = exact ?? results[0]!.id;
    this.filterIdCache.set(key, id);
    return id;
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const params: [string, string][] = [['page', String(page)]];
    const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string).trim() : '');
    const hasLookupState = LOOKUPS.some(([id]) => text(id) !== '');

    // A plain text search without any id filter fails on some sites (HTTP 500), which breaks tapping a genre tag:
    // resolve the query to a tag/artist/character id when possible and search by id instead.
    const trimmed = query.trim();
    let queryFilter: [string, number] | undefined;
    if (trimmed && !hasLookupState) {
      queryFilter = this.queryIdCache.get(trimmed.toLowerCase());
      if (!queryFilter) {
        for (const uri of QUERY_LOOKUP_URIS) {
          const id = await this.lookupFilterId(trimmed, uri, true).catch(() => null);
          if (id == null) continue;
          queryFilter = [uri, id];
          this.queryIdCache.set(trimmed.toLowerCase(), queryFilter);
          break;
        }
      }
    }
    if (queryFilter) params.push([`${queryFilter[0]}[0]`, String(queryFilter[1])]);
    else if (trimmed) params.push(['q', query]);
    params.push(...this.langParams());

    if (text('sort')) params.push(['sort', text('sort')]);
    if (text('order')) params.push(['order', text('order')]);
    if (text('duration')) params.push(['duration', text('duration')]);
    for (const [, value] of ATTRIBUTES) if (filters[`attributes.${value}`] === true) params.push(['attributes', value]);
    for (const [, value] of STATUSES) if (filters[`statuses.${value}`] === true) params.push(['statuses', value]);
    for (const [id, , uri, singular] of LOOKUPS) {
      const terms = text(id)
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      let index = 0;
      for (const term of terms) {
        const found = await this.lookupFilterId(term, uri);
        if (found == null) throw new Error(`No ${singular} "${term}" was found`);
        if (uri === 'languages' && this.hhLangId.includes(found)) continue;
        params.push([`${uri}[${index++}]`, String(found)]);
      }
    }
    return this.parsePage(this.url('comics', params));
  }

  toSummary(m: MangaDto): MangaSummary {
    return { url: `/en/comic/${m.slug}`, title: m.title, thumbnailUrl: m.image_url || undefined };
  }

  slugOf(url: string): string {
    return url.replace(/^\/en\/comic\//, '').replace(/^\/+/, '');
  }

  // Details and chapters
  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const dto = await this.api<MangaDto>(`${this.baseUrl}/api/comics/${this.slugOf(manga.url)}`);
    return this.toDetails(dto);
  }

  toDetails(m: MangaDto): MangaDetails {
    const artist = names(m.artists);
    const description = (
      [
        ['Alternative Title', m.alternative_title],
        ['Groups', names(m.groups)],
        ['Description', m.description],
        ['Pages', m.pages != null ? String(m.pages) : undefined],
        ['Category', m.category?.name],
        ['Language', m.language?.name],
        ['Parodies', names(m.parodies)],
        ['Characters', names(m.characters)],
      ] as [string, string | null | undefined][]
    )
      .filter(([, value]) => !!value)
      .map(([label, value]) => `${label}: ${value}`)
      .join('\n\n');
    const status: MangaStatus = m.status === 'ongoing' || m.status === 'onhold' ? 'ongoing' : 'completed';
    return {
      ...this.toSummary(m),
      artist,
      author: names(m.authors) ?? artist,
      genres: [...(m.tags ?? []), ...(m.relationships ?? [])].map((t) => t.name),
      description: description || undefined,
      status,
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const slug = this.slugOf(manga.url);
    if (!this.chapters) {
      const dto = await this.api<MangaDto>(`${this.baseUrl}/api/comics/${slug}`);
      return [{ url: dto.slug, name: 'Chapter', number: 1, uploadedAt: this.parseDate(dto.updated_at) }];
    }
    const list = await this.api<ChapterDto[]>(`${this.baseUrl}/api/comics/${slug}/chapters`);
    return list.map((c) => ({
      url: `${slug}/${c.slug}`,
      name: c.name ?? 'Chapter',
      uploadedAt: this.parseDate(c.added_at),
    }));
  }

  parseDate(date: string | null | undefined): number | undefined {
    if (!date) return undefined;
    if (date.includes('day')) return Date.now() - Number(date.replace(/\D/g, '')) * 86_400_000;
    return parseDate(date, 'yyyy-MM-dd');
  }

  // Pages
  async getPages(chapter: Chapter): Promise<Page[]> {
    const dto = await this.api<{ images: { page: number; source_url: string }[] }>(
      `${this.baseUrl}/api/comics/${chapter.url}/images`,
    );
    return dto.images.map((image) => ({ index: image.page, imageUrl: image.source_url }));
  }

  imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  // Filters
  getFilters(): Filter[] {
    return [
      { type: 'select', id: 'sort', label: 'Sort By', options: options(SORTS) },
      { type: 'select', id: 'order', label: 'Order By', options: options(ORDERS) },
      { type: 'select', id: 'duration', label: 'Duration', options: options(DURATIONS) },
      { type: 'header', label: 'Separate terms with commas (,)' },
      ...LOOKUPS.map(([id, label]): Filter => ({ type: 'text', id, label })),
      {
        type: 'group',
        id: 'attributes',
        label: 'Attributes',
        filters: ATTRIBUTES.map(([label, value]) => ({ type: 'checkbox', id: `attributes.${value}`, label })),
      },
      {
        type: 'group',
        id: 'statuses',
        label: 'Status',
        filters: STATUSES.map(([label, value]) => ({ type: 'checkbox', id: `statuses.${value}`, label })),
      },
    ];
  }

  // URLs
  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/(?:[a-z]{2}\/)?comic\/([^/?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: `/en/comic/${match[2]}`, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return item.url.startsWith('/') ? `${this.baseUrl}${item.url}` : `${this.baseUrl}/en/comic/${item.url}`;
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
