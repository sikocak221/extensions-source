// EZManhwa (JSON API), ported from keiyoushi/extensions-source lib-multisrc/ezmanhwa. This directory is a
// template: every extension using the theme keeps an identical copy in src/ezmanhwa/
// (`node scripts/sync-multisrc.mjs`) and sets its `apiUrl`.
//
// Manga urls are "/series/<slug>", chapter urls "/series/<series slug>/<chapter slug>".
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
import { USER_AGENT, hostOf, htmlToText, withQuery } from './utils';

export const SHOW_LOCKED_CHAPTERS_PREFERENCE: Preference = {
  type: 'switch',
  key: 'pref_show_locked_chapters',
  label: 'Show locked chapters',
  description: 'Chapters requiring coins only load when bought on the website.',
  default: false,
};

interface SeriesDto {
  slug: string;
  title: string;
  cover?: string | null;
  type?: string | null;
  status?: string | null;
  alternativeTitles?: string | null;
  description?: string | null;
  author?: string | null;
  artist?: string | null;
  genres?: { name: string }[] | null;
}

interface ChapterDto {
  slug: string;
  number?: number | null;
  title?: string | null;
  requiresPurchase?: boolean | null;
  createdAt?: string | null;
}

const option = (label: string, value: string): FilterOption => ({ label, value });

export abstract class EZManhwa {
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  abstract readonly apiUrl: string;

  userAgent = USER_AGENT;

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/`, Accept: 'application/json, text/plain, */*' };
  }

  async api<T>(url: string): Promise<T> {
    return (await http.get<T>(url, { headers: this.headers(), responseType: 'json' })).body;
  }

  async seriesList(url: string): Promise<MangaPage> {
    const data = await this.api<{ data: SeriesDto[]; totalPages: number; current: number }>(url);
    return {
      items: data.data
        .filter((s) => s.type !== 'NOVEL')
        .map((s) => ({ url: `/series/${s.slug}`, title: s.title, thumbnailUrl: s.cover || undefined })),
      hasNextPage: data.current < data.totalPages,
    };
  }

  getPopular(page: number): Promise<MangaPage> {
    return this.seriesList(`${this.apiUrl}/series?page=${page}&perPage=20&sort=popular`);
  }

  getLatest(page: number): Promise<MangaPage> {
    return this.seriesList(`${this.apiUrl}/series?page=${page}&perPage=20&sort=latest`);
  }

  /** Filter ids sent to the browse endpoint (the search endpoint takes only the query). */
  browseParams = ['sort', 'status', 'type'];

  search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const q = query.trim();
    if (q) return this.seriesList(withQuery(`${this.apiUrl}/series/search`, { page: String(page), perPage: '20', q }));
    const params: Record<string, string | undefined> = { page: String(page), perPage: '20' };
    for (const id of this.browseParams) {
      const value = filters[id];
      if (typeof value === 'string' && value) params[id] = value;
    }
    params.sort ??= 'latest';
    return this.seriesList(withQuery(`${this.apiUrl}/series`, params));
  }

  slugOf(url: string): string {
    return url.split('/').filter(Boolean)[1] ?? '';
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const s = await this.api<SeriesDto>(`${this.apiUrl}/series/${this.slugOf(manga.url)}`);
    const statuses: Record<string, MangaStatus> = {
      ONGOING: 'ongoing',
      MASS_RELEASED: 'ongoing',
      COMPLETED: 'completed',
      DROPPED: 'cancelled',
      HIATUS: 'hiatus',
    };
    let description = s.description ? htmlToText(s.description) : '';
    if (s.alternativeTitles?.trim())
      description += `${description ? '\n\n' : ''}Alternative Titles: ${s.alternativeTitles}`;
    const type = s.type?.toLowerCase();
    return {
      url: manga.url,
      title: s.title,
      thumbnailUrl: s.cover || manga.thumbnailUrl,
      author: s.author?.trim() || undefined,
      artist: s.artist?.trim() || undefined,
      description: description || undefined,
      genres: s.genres?.map((g) => g.name),
      status: statuses[s.status ?? ''] ?? 'unknown',
      type: type === 'manhwa' || type === 'manhua' || type === 'manga' ? type : undefined,
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const slug = this.slugOf(manga.url);
    const showLocked = prefs.get<boolean>(SHOW_LOCKED_CHAPTERS_PREFERENCE.key) === true;
    const chapters: Chapter[] = [];
    for (let page = 1, total = 1; page <= total; page++) {
      const data = await this.api<{ data: ChapterDto[]; totalPages?: number }>(
        `${this.apiUrl}/series/${slug}/chapters?page=${page}&perPage=100&sort=desc`,
      );
      total = data.totalPages ?? 1;
      for (const c of data.data) {
        if (c.requiresPurchase && !showLocked) continue;
        const number = c.number == null ? '' : Number.isInteger(c.number) ? String(c.number) : String(c.number);
        const title = c.title?.trim() || undefined;
        let name: string;
        if (!number) name = title ?? 'Chapter';
        else if (!title || title === number) name = `Chapter ${number}`;
        else if (title.includes(number) && /^(chapter|ch\.?|episode|ep\.?)\s*/i.test(title)) name = title;
        else if (/^[-:]/.test(title)) name = `Chapter ${number} ${title}`;
        else name = `Chapter ${number} - ${title}`;
        const time = c.createdAt ? Date.parse(c.createdAt) : Number.NaN;
        chapters.push({
          url: `/series/${slug}/${c.slug}`,
          name: c.requiresPurchase ? `🔒 ${name}` : name,
          number: c.number ?? undefined,
          uploadedAt: Number.isFinite(time) ? time : undefined,
        });
      }
    }
    return chapters;
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const [, series, slug] = chapter.url.split('/').filter(Boolean);
    const data = await this.api<{
      images?: { url: string }[] | null;
      requiresPurchase?: boolean | null;
      totalImages?: number | null;
    }>(`${this.apiUrl}/series/${series}/chapters/${slug}`);
    if (data.requiresPurchase)
      throw new Error(`Chapter requires purchase (${data.totalImages ?? '?'} pages). Buy it on the website to read.`);
    if (!data.images) throw new Error('No images found. The chapter may be locked.');
    return data.images.map((image, index) => ({ index, imageUrl: image.url }));
  }

  imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  getFilters(): Filter[] {
    return [
      {
        type: 'select',
        id: 'sort',
        label: 'Sort',
        options: [
          option('Latest', 'latest'),
          option('Popular', 'popular'),
          option('Newest', 'newest'),
          option('Alphabetical', 'alphabetical'),
        ],
      },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [
          option('All', ''),
          option('Ongoing', 'ONGOING'),
          option('Completed', 'COMPLETED'),
          option('Hiatus', 'HIATUS'),
          option('Dropped', 'DROPPED'),
        ],
      },
      {
        type: 'select',
        id: 'type',
        label: 'Type',
        options: [option('All', ''), option('Manga', 'MANGA'), option('Manhwa', 'MANHWA'), option('Manhua', 'MANHUA')],
      },
    ];
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/series\/([^/?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: `/series/${match[2]}`, title: '' };
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
