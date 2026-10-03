// MangaTaro, ported from keiyoushi/extensions-source lib-multisrc/mangataro. This directory is a template:
// every extension using the theme keeps an identical copy in src/mangataro/ (`node scripts/sync-multisrc.mjs`).
//
// Manga urls are "/manga/<slug>" (the numeric id is read from the page), chapter urls the site's own paths.
// The chapter API is signed with the server's clock, taken from the Date header of a HEAD request.
import type {
  Chapter,
  Filter,
  FilterState,
  MangaDetails,
  MangaPage,
  MangaStatus,
  MangaSummary,
  Page,
  Source,
} from '@matane/extension-sdk';
import { USER_AGENT, decodeEntities, hostOf, htmlToText, relativeUrl } from './utils';

export interface BrowseManga {
  id: string;
  url: string;
  title: string;
  cover: string;
  type: string;
  description: string;
  status: string;
}

export type Tag = [string, number];

const SORTS = [
  { label: 'Latest Updates', value: 'post' },
  { label: 'Release Date', value: 'release' },
  { label: 'Title A-Z', value: 'title' },
  { label: 'Popular', value: 'popular' },
];

export abstract class MangaTaro {
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  abstract readonly lang: string;

  userAgent = USER_AGENT;
  tags: Tag[] = [];

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  unescape(text: string): string {
    let value = text;
    for (let previous = ''; previous !== value;) {
      previous = value;
      value = decodeEntities(value);
    }
    return value;
  }

  slugOf(url: string): string {
    const path = url
      .replace(/^https?:\/\/[^/]+/, '')
      .split(/[?#]/)[0]!
      .split('/')
      .filter(Boolean);
    if ((path.length === 2 && path[0] === 'manga') || (path.length === 3 && path[0] === 'read')) return path[1]!;
    throw new Error(`Expected manga or read path, got ${url}`);
  }

  toStatus(status: string): MangaStatus {
    return status === 'Ongoing' ? 'ongoing' : status === 'Completed' ? 'completed' : 'unknown';
  }

  async fetchBrowsePage(page: number, query: string, filters: FilterState): Promise<BrowseManga[]> {
    const text = (id: string) => (typeof filters[id] === 'string' && filters[id] ? (filters[id] as string) : null);
    const sort = typeof filters.sort === 'object' ? filters.sort : { value: 'post', ascending: false };
    const genres = Object.entries(filters)
      .filter(([id, value]) => id.startsWith('tag.') && value === true)
      .map(([id]) => Number(id.slice('tag.'.length)));
    const year = text('year');
    const body = {
      page,
      search: query.trim(),
      years: JSON.stringify(year ? [Number(year)] : []),
      genres: JSON.stringify(genres),
      types: JSON.stringify(text('type') ? [text('type')] : []),
      statuses: JSON.stringify(text('status') ? [text('status')] : []),
      sort: `${sort.value || 'post'}_${sort.ascending ? 'asc' : 'desc'}`,
      genreMatchMode: text('match') ?? 'any',
    };
    return (
      await http.post<BrowseManga[]>(
        `${this.baseUrl}/wp-json/manga/v1/load`,
        { json: body },
        { headers: this.headers(), responseType: 'json' },
      )
    ).body;
  }

  browseToSummary(m: BrowseManga): MangaSummary {
    return { url: `/manga/${this.slugOf(m.url)}`, title: this.unescape(m.title), thumbnailUrl: m.cover || undefined };
  }

  async browse(page: number, query: string, filters: FilterState): Promise<MangaPage> {
    const data = await this.fetchBrowsePage(page, query, filters);
    return {
      items: data.filter((m) => m.type !== 'Novel' && m.url).map((m) => this.browseToSummary(m)),
      hasNextPage: data.length === 24,
    };
  }

  getPopular(page: number): Promise<MangaPage> {
    return this.browse(page, '', { sort: { value: 'popular', ascending: false } });
  }

  getLatest(page: number): Promise<MangaPage> {
    return this.browse(page, '', { sort: { value: 'post', ascending: false } });
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    if (!query.trim() || filters.withFilters === true) return this.browse(page, query, filters);
    const data = (
      await http.post<{ results: { slug: string; title: string; thumbnail: string; type: string }[] }>(
        `${this.baseUrl}/auth/search`,
        { json: { query: query.trim(), limit: 25 } },
        { headers: this.headers(), responseType: 'json' },
      )
    ).body.results;
    return {
      items: data
        .filter((m) => m.type !== 'Novel')
        .map((m) => ({
          url: `/manga/${m.slug}`,
          title: this.unescape(m.title),
          thumbnailUrl: m.thumbnail || undefined,
        })),
      hasNextPage: false,
    };
  }

  /** The numeric id and the status, from the series page. */
  async pageInfo(url: string): Promise<{ id: string; status: MangaStatus }> {
    const document = html.load(
      (await http.get(`${this.baseUrl}/manga/${this.slugOf(url)}`, { headers: this.headers() })).body,
    );
    const id = document.selectFirst('body')?.attr('data-manga-id');
    if (!id) throw new Error('Manga id not found');
    const labels = document.select('.capitalize').map((e) => e.text().toLowerCase());
    if (labels.some((l) => l.includes('novel'))) throw new Error('Novels are not supported');
    const status = labels.find((l) => l === 'ongoing' || l === 'completed');
    return { id, status: status === 'ongoing' ? 'ongoing' : status === 'completed' ? 'completed' : 'unknown' };
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const { id, status } = await this.pageInfo(manga.url);
    const data = (
      await http.get<{
        slug: string;
        title: { rendered: string };
        content: { rendered: string };
        type: string;
        _embedded: {
          'wp:featuredmedia'?: { source_url: string }[];
          'wp:term'?: { name: string; taxonomy: string }[][];
        };
      }>(`${this.baseUrl}/wp-json/wp/v2/manga/${id}?_embed`, { headers: this.headers(), responseType: 'json' })
    ).body;
    const terms = (type: string) =>
      (data._embedded['wp:term'] ?? []).find((list) => list[0]?.taxonomy === type)?.map((t) => t.name) ?? [];
    const genres = new Set(terms('post_tag'));
    if (!['Manhwa', 'Manhua', 'Manga'].some((t) => genres.has(t))) genres.add(data.type);
    return {
      url: `/manga/${data.slug}`,
      title: this.unescape(data.title.rendered),
      description: this.unescape(htmlToText(data.content.rendered)).trim() || undefined,
      genres: [...genres],
      author: terms('manga_author').join(', ') || undefined,
      status,
      thumbnailUrl: data._embedded['wp:featuredmedia']?.[0]?.source_url ?? manga.thumbnailUrl,
    };
  }

  async serverTime(): Promise<number> {
    try {
      const response = await http.request({ url: `${this.baseUrl}/`, method: 'HEAD', headers: this.headers() });
      const date = Object.entries(response.headers).find(([name]) => name.toLowerCase() === 'date')?.[1];
      const time = date ? Date.parse(date) : Number.NaN;
      if (Number.isFinite(time)) return time;
    } catch (error) {
      log.warn('Cannot read the server time', error);
    }
    return Date.now();
  }

  chapterListUrl(id: string, offset: number, now: number, group?: string): string {
    const seconds = Math.floor(now / 1000);
    const d = new Date(now);
    const pad = (n: number) => String(n).padStart(2, '0');
    const hour = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}`;
    const token = crypto.md5(`${seconds}mng_ch_${hour}`).slice(0, 16);
    return `${this.baseUrl}/auth/manga-chapters?manga_id=${id}&offset=${offset}&limit=500&order=DESC&_t=${token}&_ts=${seconds}${group ? `&group_id=${group}` : ''}`;
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const { id } = await this.pageInfo(manga.url);
    const now = await this.serverTime();
    const data: {
      url: string;
      chapter: string;
      title?: string | null;
      date: string;
      group_name?: string | null;
      language: string;
    }[] = [];
    for (let more = true; more;) {
      const page = (
        await http.get<{ chapters: typeof data; has_more?: boolean }>(this.chapterListUrl(id, data.length, now), {
          headers: this.headers(),
          responseType: 'json',
        })
      ).body;
      data.push(...page.chapters);
      more = Boolean(page.has_more) && page.chapters.length > 0;
    }
    const placeholders = new Set(['', 'N/A', '—']);
    return data
      .filter((c) => c.language.toLowerCase() === this.lang.toLowerCase())
      .map((c) => ({
        url: relativeUrl(c.url.replace(/\/$/, '')),
        name: `Chapter ${c.chapter}${c.title && !placeholders.has(c.title) ? `: ${this.unescape(c.title)}` : ''}`,
        scanlator: c.group_name && !placeholders.has(c.group_name) ? c.group_name : undefined,
        uploadedAt: this.parseRelativeDate(c.date),
      }));
  }

  parseRelativeDate(text: string): number | undefined {
    const match = /^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/.exec(text.trim());
    if (!match) return undefined;
    const amount = Number(match[1]);
    const date = new Date();
    const unit = match[2]!;
    if (unit === 'second') date.setSeconds(date.getSeconds() - amount);
    else if (unit === 'minute') date.setMinutes(date.getMinutes() - amount);
    else if (unit === 'hour') date.setHours(date.getHours() - amount);
    else if (unit === 'day') date.setDate(date.getDate() - amount);
    else if (unit === 'week') date.setDate(date.getDate() - amount * 7);
    else if (unit === 'month') date.setMonth(date.getMonth() - amount);
    else date.setFullYear(date.getFullYear() - amount);
    return date.getTime();
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const chapterId = chapter.url.replace(/\/$/, '').split('/').pop()!.split('-').pop();
    const data = (
      await http.get<{ images: string[] }>(`${this.baseUrl}/auth/chapter-content?chapter_id=${chapterId}`, {
        headers: this.headers(),
        responseType: 'json',
      })
    ).body;
    return data.images.map((imageUrl, index) => ({ index, imageUrl }));
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  getFilters(): Filter[] {
    const all = { label: 'All', value: '' };
    const year = new Date().getFullYear();
    const filters: Filter[] = [
      { type: 'checkbox', id: 'withFilters', label: 'Apply filters to Text Search' },
      { type: 'header', label: 'If unchecked, all filters will be ignored with search query' },
      { type: 'header', label: 'But will give more relevant results' },
      { type: 'separator' },
      { type: 'sort', id: 'sort', label: 'Sort', options: SORTS, default: { value: 'post', ascending: false } },
      {
        type: 'select',
        id: 'type',
        label: 'Type',
        options: [all, ...['Manga', 'Manhwa', 'Manhua'].map((t) => ({ label: t, value: t }))],
      },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [all, { label: 'Completed', value: 'Completed' }, { label: 'Ongoing', value: 'Ongoing' }],
      },
      {
        type: 'select',
        id: 'year',
        label: 'Year',
        options: [
          all,
          ...Array.from({ length: year - 1948 }, (_, i) => String(year - i)).map((y) => ({ label: y, value: y })),
        ],
      },
    ];
    if (this.tags.length > 0)
      filters.push({
        type: 'group',
        id: 'tag',
        label: 'Tags',
        filters: this.tags.map(([label, id]) => ({ type: 'checkbox', id: `tag.${id}`, label })),
      });
    filters.push({
      type: 'select',
      id: 'match',
      label: 'Tag Match',
      options: [
        { label: 'Any', value: 'any' },
        { label: 'All', value: 'all' },
      ],
    });
    return filters;
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/(?:manga|read)\/([^/?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: `/manga/${match[2]}`, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return `${this.baseUrl}${item.url}`;
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
