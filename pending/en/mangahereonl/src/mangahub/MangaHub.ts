// MangaHub (sites sharing the api.mghcdn.com GraphQL API), ported from keiyoushi/extensions-source
// lib-multisrc/mangahub. This directory is a template: every extension using the theme keeps an identical
// copy in src/mangahub/ (`node scripts/sync-multisrc.mjs`) and sets its `mangaSource`.
//
// The API wants the site's "mhub_access" cookie value in an x-mhub-access header; the home page sets it.
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
import { USER_AGENT, hostOf } from './utils';

const API_URL = 'https://api.mghcdn.com/graphql';
const IMAGE_CDN = 'https://imgx.mghcdn.com';
const THUMB_CDN = 'https://thumb.mghcdn.com';

interface MangaData {
  title?: string | null;
  status?: string | null;
  image?: string | null;
  author?: string | null;
  artist?: string | null;
  genres?: string | null;
  description?: string | null;
  alternativeTitle?: string | null;
  slug?: string | null;
  chapters?: { number: number; title: string; date: string }[] | null;
}

export abstract class MangaHub {
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  /** API source id of the site, e.g. "mf01". */
  abstract readonly mangaSource: string;

  userAgent = USER_AGENT;
  private key: string | null = null;

  headers(): Record<string, string> {
    return {
      'User-Agent': this.userAgent,
      Referer: `${this.baseUrl}/`,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    };
  }

  /** The access key: the "mhub_access" cookie the site sets (the home page does). */
  async accessKey(refresh = false): Promise<string> {
    if (this.key && !refresh) return this.key;
    const response = await http.request<string>({
      url: `${this.baseUrl}/${refresh ? '?reloadKey=1' : ''}`,
      headers: this.headers(),
    });
    const cookie = Object.entries(response.headers).find(([name]) => name.toLowerCase() === 'set-cookie')?.[1] ?? '';
    const key = /mhub_access=([^;,\s]+)/.exec(cookie)?.[1];
    if (!key) throw new Error('Could not get an API key from the site');
    this.key = key;
    return key;
  }

  async graphql<T>(query: string): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await http.request<{ data?: T; errors?: { message: string }[] }>({
        url: API_URL,
        method: 'POST',
        body: { json: { query } },
        responseType: 'json',
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json',
          Origin: this.baseUrl,
          Referer: `${this.baseUrl}/`,
          'x-mhub-access': await this.accessKey(attempt > 0),
        },
      });
      const error = response.body?.errors?.[0]?.message ?? '';
      if (response.body?.data && !error) return response.body.data;
      // An outdated key answers "rate limit" / "api key" errors: get a new one once.
      if (
        attempt === 0 &&
        (response.status === 401 || response.status === 403 || /rate\s*limit|api\s*key/i.test(error))
      )
        continue;
      throw new Error(error || `HTTP ${response.status}`);
    }
    throw new Error('MangaHub API error');
  }

  // Listing
  async mangaList(page: number, order: string, query = '', genres = 'all'): Promise<MangaPage> {
    const q = JSON.stringify(query).slice(1, -1);
    const data = await this.graphql<{ search?: { rows: { title: string; slug: string; image?: string | null }[] } }>(
      `{search(x: ${this.mangaSource}, q: "${q}", genre: "${genres}", mod: ${order}, offset: ${(page - 1) * 30}){rows{title,slug,image}}}`,
    );
    const rows = data.search?.rows ?? [];
    return {
      items: rows.map((row) => ({
        url: `/manga/${row.slug}`,
        title: row.title,
        thumbnailUrl: row.image ? `${THUMB_CDN}/${row.image}` : undefined,
      })),
      hasNextPage: rows.length === 30,
    };
  }

  getPopular(page: number): Promise<MangaPage> {
    return this.mangaList(page, 'POPULAR');
  }

  getLatest(page: number): Promise<MangaPage> {
    return this.mangaList(page, 'LATEST');
  }

  search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const order = typeof filters.order === 'string' && filters.order ? filters.order : 'POPULAR';
    const genres = Object.entries(filters)
      .filter(([id, value]) => id.startsWith('genre.') && value === true)
      .map(([id]) => id.slice(6));
    return this.mangaList(page, order, query.trim(), genres.length > 0 ? genres.join(',') : 'all');
  }

  // Details and chapters
  async fetchManga(url: string): Promise<MangaData> {
    const slug = url.replace(/^\/manga\//, '');
    const data = await this.graphql<{ manga?: MangaData | null }>(
      `{manga(x: ${this.mangaSource}, slug: "${slug}"){title,slug,status,image,author,artist,genres,description,alternativeTitle,chapters{number,title,date}}}`,
    );
    if (!data.manga) throw new Error('Manga not found');
    return data.manga;
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const data = await this.fetchManga(manga.url);
    const statuses: Record<string, MangaStatus> = { ongoing: 'ongoing', completed: 'completed' };
    const alternatives = (data.alternativeTitle ?? '')
      .split(';')
      .map((t) => t.trim())
      .filter(Boolean);
    let description = data.description ?? '';
    if (alternatives.length > 0)
      description += `${description.trim() ? '\n\n' : ''}Alternative Names:\n${alternatives.map((t) => `- ${t}`).join('\n')}`;
    return {
      url: manga.url,
      title: data.title || manga.title,
      author: data.author || undefined,
      artist: data.artist || undefined,
      genres: data.genres
        ?.split(',')
        .map((g) => g.trim())
        .filter(Boolean),
      thumbnailUrl: data.image ? `${THUMB_CDN}/${data.image}` : manga.thumbnailUrl,
      status: statuses[data.status ?? ''] ?? 'unknown',
      description: description || undefined,
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const data = await this.fetchManga(manga.url);
    return (data.chapters ?? [])
      .map((c) => {
        const number = String(c.number).replace(/\.0$/, '');
        const title = c.title.trim().replace(/\s+/g, ' ');
        const time = Date.parse(c.date);
        return {
          url: `/${data.slug}/chapter-${c.number}`,
          name: title.includes(number) ? title : title ? `Chapter ${number} - ${title}` : `Chapter ${number}`,
          number: c.number,
          uploadedAt: Number.isFinite(time) ? time : undefined,
        };
      })
      .reverse();
  }

  // Pages
  async getPages(chapter: Chapter): Promise<Page[]> {
    const [, slug = '', part = ''] = chapter.url.split('/');
    const number = Number.parseFloat(part.replace(/^chapter-/, ''));
    const data = await this.graphql<{ chapter?: { pages: string } | null }>(
      `{chapter(x: ${this.mangaSource}, slug: "${slug}", number: ${number}){pages,mangaID,number}}`,
    );
    if (!data.chapter) throw new Error('Chapter not found');
    const pages = JSON.parse(data.chapter.pages) as { p: string; i: string[] };
    return pages.i.map((image, index) => ({ index, imageUrl: `${IMAGE_CDN}/${pages.p}${image}` }));
  }

  imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  // Filters
  async getFilters(): Promise<Filter[]> {
    const filters: Filter[] = [];
    try {
      const response = await http.get(`${this.baseUrl}/search`, { headers: this.headers() });
      const seen = new Set<string>();
      const genres = html
        .load(response.body)
        .select('a.genre-label')
        .map((a) => ({ label: a.text(), key: (a.attr('href') ?? '').split('/').pop() ?? '' }))
        .filter((g) => g.key && !seen.has(g.key) && Boolean(seen.add(g.key)))
        .sort((a, b) => a.label.localeCompare(b.label));
      if (genres.length > 0) {
        filters.push({
          type: 'group',
          id: 'genre',
          label: 'Genres',
          filters: genres.map((g) => ({ type: 'checkbox', id: `genre.${g.key}`, label: g.label })),
        });
      }
    } catch (error) {
      log.warn('Cannot load genres', error);
    }
    filters.push({
      type: 'select',
      id: 'order',
      label: 'Order',
      options: [
        { label: 'Popular', value: 'POPULAR' },
        { label: 'Updates', value: 'LATEST' },
        { label: 'A-Z', value: 'ALPHABET' },
        { label: 'New', value: 'NEW' },
        { label: 'Completed', value: 'COMPLETED' },
      ],
    });
    return filters;
  }

  // URLs
  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/(?:manga|chapter)\/([^/?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: `/manga/${match[2]}`, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return item.url.startsWith('/manga/') ? `${this.baseUrl}${item.url}` : `${this.baseUrl}/chapter${item.url}`;
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
