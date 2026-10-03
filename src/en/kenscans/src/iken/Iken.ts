// Iken (JSON API at api.<site>), ported from keiyoushi/extensions-source lib-multisrc/iken. This directory
// is a template: every extension using the theme keeps an identical copy in src/iken/
// (`node scripts/sync-multisrc.mjs`) and overrides members in a subclass.
//
// Manga urls are "/series/<slug>"; chapter urls "/series/<series slug>/<chapter slug>#<chapter id>".
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
  label: 'Show inaccessible chapters',
  description: 'Locked chapters (coins, time-locked) are marked with a lock.',
  default: false,
};

export interface IkenManga {
  id: number;
  slug: string;
  postTitle: string;
  postContent?: string | null;
  isNovel?: boolean;
  featuredImage?: string | null;
  alternativeTitles?: string | null;
  author?: string | null;
  artist?: string | null;
  seriesType?: string | null;
  seriesStatus?: string | null;
  genres?: { id: number; name: string }[];
  chapters?: IkenChapter[];
}

export interface IkenChapter {
  id: number;
  slug: string;
  number: number | string;
  title?: string | null;
  createdAt: string;
  isLocked?: boolean | null;
  isTimeLocked?: boolean | null;
  price?: number | null;
  chapterPurchased?: boolean | null;
  mangaPost?: { slug?: string | null } | null;
}

const option = (label: string, value: string): FilterOption => ({ label, value });

export abstract class Iken {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;
  perPage = 18;
  /** Sort images by the number in their file name instead of their order field. */
  sortPagesByFilename = false;

  get apiUrl(): string {
    return this.baseUrl.replace('https://', 'https://api.');
  }

  statusFilterOptions: FilterOption[] = [
    option('All', ''),
    option('Ongoing', 'ONGOING'),
    option('Completed', 'COMPLETED'),
    option('Canceled', 'CANCELLED'),
    option('Dropped', 'DROPPED'),
    option('Coming Soon', 'COMING_SOON'),
    option('Mass Released', 'MASS_RELEASED'),
  ];

  typeFilterOptions: FilterOption[] = [
    option('All', ''),
    option('Manga', 'MANGA'),
    option('Manhua', 'MANHUA'),
    option('Manhwa', 'MANHWA'),
    option('Russian', 'RUSSIAN'),
    option('Spanish', 'SPANISH'),
  ];

  sortOptions: FilterOption[] = [
    option('Last Chapter', 'lastChapterAddedAt'),
    option('Views', 'totalViews'),
    option('Added Date', 'createdAt'),
    option('Chapters Count', 'chaptersCount'),
    option('Alphabetical', 'postTitle'),
  ];

  async api<T>(path: string): Promise<T> {
    const response = await http.get<T>(`${this.apiUrl}${path}`, { headers: this.headers(), responseType: 'json' });
    return response.body;
  }

  // Listing
  getPopular(page: number): Promise<MangaPage> {
    return this.search('', page, { orderBy: this.sortOptions[1]!.value });
  }

  getLatest(page: number): Promise<MangaPage> {
    return this.search('', page, { orderBy: this.sortOptions[0]!.value });
  }

  async search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : undefined);
    const genres = Object.entries(filters)
      .filter(([id, value]) => id.startsWith('genre.') && value === true)
      .map(([id]) => id.slice(6));
    // Pages full of novels (left out) are skipped.
    for (let current = page; current < page + 10; current++) {
      const url = withQuery(`${this.apiUrl}/api/query`, {
        page: String(current),
        perPage: String(this.perPage),
        searchTerm: query.trim(),
        seriesStatus: text('seriesStatus'),
        seriesType: text('seriesType'),
        orderBy: text('orderBy') ?? this.sortOptions[0]!.value,
        orderDirection: text('orderDirection'),
        genreIds: genres.length > 0 ? genres.join(',') : undefined,
      });
      const data = (
        await http.get<{ posts: IkenManga[]; totalCount: number }>(url, {
          headers: this.headers(),
          responseType: 'json',
        })
      ).body;
      const items = data.posts.filter((m) => !this.isNovel(m)).map((m) => this.toSummary(m));
      const hasNextPage = data.totalCount > current * this.perPage;
      if (items.length > 0 || !hasNextPage) return { items, hasNextPage };
    }
    return { items: [], hasNextPage: false };
  }

  isNovel(manga: IkenManga): boolean {
    return manga.isNovel === true || manga.seriesType?.toLowerCase() === 'novel';
  }

  toSummary(manga: IkenManga): MangaSummary {
    return { url: `/series/${manga.slug}`, title: manga.postTitle, thumbnailUrl: manga.featuredImage || undefined };
  }

  // Details
  async fetchManga(url: string): Promise<{ post: IkenManga; totalChapterCount?: number | null }> {
    const slug = url.split('#')[0]!.replace(/\/+$/, '').split('/').pop() ?? '';
    const data = await this.api<{ post: IkenManga; totalChapterCount?: number | null }>(
      `/api/post?postSlug=${encodeURIComponent(slug)}`,
    );
    if (this.isNovel(data.post)) throw new Error('Novels are unsupported');
    return data;
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const { post } = await this.fetchManga(manga.url);
    const statuses: Record<string, MangaStatus> = {
      ONGOING: 'ongoing',
      COMING_SOON: 'ongoing',
      MASS_RELEASED: 'ongoing',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
      DROPPED: 'cancelled',
    };
    const types: Record<string, string> = { MANGA: 'Manga', MANHUA: 'Manhua', MANHWA: 'Manhwa' };
    let description = post.postContent ? htmlToText(post.postContent.replace(/\n/g, '<br>')) : '';
    if (post.alternativeTitles?.trim())
      description += `${description ? '\n\n' : ''}Alternative Names: ${post.alternativeTitles}`;
    const type = post.seriesType ? types[post.seriesType] : undefined;
    return {
      ...this.toSummary(post),
      author: post.author || undefined,
      artist: post.artist || undefined,
      description: description || undefined,
      genres: [...new Set([...(type ? [type] : []), ...(post.genres ?? []).map((g) => g.name)])],
      status: statuses[post.seriesStatus ?? ''] ?? 'unknown',
      type: type ? (type.toLowerCase() as 'manga' | 'manhua' | 'manhwa') : undefined,
    };
  }

  // Chapters
  isLocked(chapter: IkenChapter): boolean {
    return (
      chapter.isLocked === true ||
      chapter.isTimeLocked === true ||
      (chapter.chapterPurchased === false && (chapter.price ?? 0) !== 0)
    );
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const data = await this.fetchManga(manga.url);
    let chapters = data.post.chapters ?? [];
    // The post only carries part of a long list: the chapters endpoint has them all.
    if ((data.totalChapterCount ?? 0) > chapters.length) {
      const all = await this.api<{ post: { chapters: IkenChapter[] } }>(`/api/chapters?postId=${data.post.id}`);
      if (all.post.chapters.length > chapters.length) chapters = all.post.chapters;
    }
    const showLocked = prefs.get<boolean>(SHOW_LOCKED_CHAPTERS_PREFERENCE.key) === true;
    return chapters
      .filter((c) => showLocked || !this.isLocked(c))
      .map((c) => {
        const time = Date.parse(c.createdAt);
        const seriesSlug = data.post.slug || c.mangaPost?.slug || '';
        return {
          url: `/series/${seriesSlug}/${c.slug}#${c.id}`,
          name: `${this.isLocked(c) ? '🔒 ' : ''}Chapter ${c.number}${c.title?.trim() ? ` - ${c.title}` : ''}`,
          number: Number.parseFloat(String(c.number)) || undefined,
          uploadedAt: Number.isFinite(time) ? time : undefined,
        };
      });
  }

  // Pages
  async getPages(chapter: Chapter): Promise<Page[]> {
    const id = chapter.url.split('#')[1];
    if (!id) throw new Error('Refresh the chapter list');
    const { chapter: data } = await this.api<{
      chapter: {
        images: { url: string; order?: number | null }[];
        isPermanentlyLocked?: boolean;
        isLockedByCoins?: boolean;
        isShortLinkLocked?: boolean;
      };
    }>(`/api/chapter?chapterId=${id}`);
    if (data.isShortLinkLocked) throw new Error('Chapter locked (short link)');
    if (data.isLockedByCoins) throw new Error('Chapter locked (coins required)');
    if (data.isPermanentlyLocked) throw new Error('Chapter permanently locked');
    const fileNumber = (url: string) => Number.parseInt(/\d+/.exec(url.split('/').pop() ?? '')?.[0] ?? '', 10);
    const images = [...data.images].sort((a, b) =>
      this.sortPagesByFilename
        ? (fileNumber(a.url) || Number.MAX_SAFE_INTEGER) - (fileNumber(b.url) || Number.MAX_SAFE_INTEGER)
        : (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER),
    );
    return images.map((image, index) => ({ index, imageUrl: image.url.replace(/ /g, '%20') }));
  }

  imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  // Filters
  async getFilters(): Promise<Filter[]> {
    const filters: Filter[] = [
      { type: 'select', id: 'seriesStatus', label: 'Status', options: this.statusFilterOptions },
      { type: 'select', id: 'seriesType', label: 'Type', options: this.typeFilterOptions },
      { type: 'select', id: 'orderBy', label: 'Sort By', options: this.sortOptions },
      {
        type: 'select',
        id: 'orderDirection',
        label: 'Sort Direction',
        options: [option('Descending', 'desc'), option('Ascending', 'asc')],
      },
    ];
    try {
      const genres = await this.api<{ id: number; name: string }[]>('/api/genres');
      if (genres.length > 0) {
        filters.push(
          { type: 'separator' },
          {
            type: 'group',
            id: 'genre',
            label: 'Genres',
            filters: genres.map((g) => ({ type: 'checkbox', id: `genre.${g.id}`, label: g.name })),
          },
        );
      }
    } catch (error) {
      log.warn('Cannot load genres', error);
    }
    return filters;
  }

  // URLs
  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/series\/([^/?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: `/series/${match[2]}`, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return `${this.baseUrl}${item.url.split('#')[0]}`;
  }

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/`, Accept: 'application/json' };
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
