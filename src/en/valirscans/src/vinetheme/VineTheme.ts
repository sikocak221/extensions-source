// VineTheme (Next.js sites with /api/series), ported from keiyoushi/extensions-source
// lib-multisrc/vinetheme. This directory is a template: every extension using the theme keeps an
// identical copy in src/vinetheme/ (`node scripts/sync-multisrc.mjs`).
//
// Manga urls are "/series/comic/<slug>", chapter urls "/series/comic/<slug>/chapter/<number>#locked".
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
import { USER_AGENT, absoluteUrl, findRscObject, hostOf, htmlToText, withQuery } from './utils';

export const HIDE_LOCKED_CHAPTERS_PREFERENCE: Preference = {
  type: 'switch',
  key: 'pref_hide_locked_chapters',
  label: 'Hide locked chapters',
  description: 'Hide chapters that require coins to read.',
  default: true,
};

interface MangaDto {
  id: string;
  title: string;
  coverImage?: string | null;
  slug?: string;
  status?: string;
  type?: string;
  origin?: string;
  rating?: number;
  isHot?: boolean;
  isMature?: boolean;
  salePercent?: number | null;
  originalTitle?: string | null;
  aliases?: string[];
  description?: string | null;
  genres?: { name?: string; slug?: string; genre?: { slug?: string } | null }[];
  team?: { name?: string | null } | null;
}

interface ChapterDto {
  id: string;
  number: number;
  title?: string | null;
  publishedAt?: string | null;
  isLocked?: boolean;
}

interface DetailDto {
  series: MangaDto;
  chapters?: ChapterDto[];
  totalPages?: number;
}

const option = (label: string, value: string): FilterOption => ({ label, value });
const stripEmoji = (text: string) => text.replace(/[^\p{ASCII}\p{L}0-9\- ]+/gu, '').trim();

export abstract class VineTheme {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  rscHeaders(): Record<string, string> {
    return { ...this.headers(), rsc: '1' };
  }

  toSummary(manga: MangaDto): MangaSummary {
    return {
      url: `/series/comic/${manga.slug ?? manga.id}`,
      title: manga.title,
      thumbnailUrl: manga.coverImage ? absoluteUrl(this.baseUrl, manga.coverImage) : undefined,
    };
  }

  async seriesList(params: Record<string, string | undefined>): Promise<MangaPage> {
    const url = withQuery(`${this.baseUrl}/api/series`, { limit: '24', contentMode: 'comics', ...params });
    const data = (
      await http.get<{ data?: MangaDto[]; meta?: { hasMore?: boolean } | null }>(url, {
        headers: this.headers(),
        responseType: 'json',
      })
    ).body;
    return { items: (data.data ?? []).map((m) => this.toSummary(m)), hasNextPage: data.meta?.hasMore === true };
  }

  getPopular(page: number): Promise<MangaPage> {
    return this.seriesList({ sort: 'popular', page: String(page) });
  }

  getLatest(page: number): Promise<MangaPage> {
    return this.seriesList({ sort: 'updated', page: String(page) });
  }

  search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const text = (id: string) => (typeof filters[id] === 'string' && filters[id] ? (filters[id] as string) : undefined);
    const genres = Object.entries(filters)
      .filter(([id, value]) => id.startsWith('genre.') && value === true)
      .map(([id]) => id.slice(6));
    return this.seriesList({
      q: query.trim() || undefined,
      sort: text('sort') ?? 'updated',
      status: text('status'),
      type: text('type'),
      origin: text('origin'),
      genre: genres.length > 0 ? genres.join(',') : undefined,
      page: String(page),
    });
  }

  // Details and chapters (React Server Components payload of the series page)
  async fetchDetail(url: string, page = 1): Promise<DetailDto> {
    const target = withQuery(absoluteUrl(this.baseUrl, url.split('#')[0]!), {
      sort: 'desc',
      page: page > 1 ? String(page) : undefined,
    });
    const response = await http.get(target, { headers: this.rscHeaders() });
    const detail = findRscObject<DetailDto>(response.body, (o) => 'series' in o && 'chapters' in o);
    if (!detail) throw new Error('Could not read the series page');
    return detail;
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const { series } = await this.fetchDetail(manga.url);
    const statuses: Record<string, MangaStatus> = {
      ONGOING: 'ongoing',
      COMPLETED: 'completed',
      HIATUS: 'hiatus',
      CANCELLED: 'cancelled',
    };
    const info = [
      series.rating && series.rating > 0 ? `Rating: ${series.rating}` : '',
      series.type ? `Type: ${series.type}` : '',
      series.origin ? `Origin: ${series.origin}` : '',
      series.isHot ? 'Featured' : '',
      series.isMature ? 'Mature' : '',
      series.salePercent && series.salePercent > 0 ? `Sale: ${series.salePercent}%` : '',
    ].filter(Boolean);
    const altTitles = [
      ...new Set([series.originalTitle, ...(series.aliases ?? [])].map((t) => t?.trim() ?? '')),
    ].filter((t) => t && t.toLowerCase() !== series.title.toLowerCase());
    const parts = [
      series.description ? htmlToText(series.description) : '',
      info.join('\n'),
      altTitles.length > 0 ? `Alternative titles:\n${altTitles.map((t) => `- ${t}`).join('\n')}` : '',
    ].filter(Boolean);
    const type = series.type?.toLowerCase();
    return {
      ...this.toSummary(series),
      url: manga.url,
      author: series.team?.name || undefined,
      status: statuses[series.status ?? ''] ?? 'unknown',
      genres: [
        ...new Set(
          [
            series.type,
            series.origin,
            series.isMature ? 'Mature' : '',
            ...(series.genres ?? []).map((g) => stripEmoji(g.name || g.genre?.slug || '')),
          ].filter((g): g is string => Boolean(g)),
        ),
      ],
      description: parts.join('\n\n') || undefined,
      type: type === 'manhwa' || type === 'manhua' || type === 'manga' ? type : undefined,
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const first = await this.fetchDetail(manga.url);
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, (first.totalPages ?? 1) - 1) }, (_, i) =>
        this.fetchDetail(manga.url, i + 2).catch(() => null),
      ),
    );
    const hideLocked = prefs.get<boolean>(HIDE_LOCKED_CHAPTERS_PREFERENCE.key) !== false;
    const slug = manga.url.split('#')[0]!.replace(/\/+$/, '').split('/').pop() ?? '';
    const seen = new Set<string>();
    return [first, ...rest]
      .flatMap((detail) => detail?.chapters ?? [])
      .filter((c) => !(hideLocked && c.isLocked) && !seen.has(c.id) && Boolean(seen.add(c.id)))
      .map((c) => {
        const number = String(c.number).replace(/\.0$/, '');
        const name = !c.title || c.title === number ? `Chapter ${number}` : c.title;
        const time = c.publishedAt ? Date.parse(c.publishedAt) : Number.NaN;
        return {
          url: `/series/comic/${slug}/chapter/${number}${c.isLocked ? '#locked' : ''}`,
          name: c.isLocked ? `🔒 ${name}` : name,
          number: c.number,
          uploadedAt: Number.isFinite(time) ? time : undefined,
        };
      })
      .sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    if (chapter.url.endsWith('#locked')) throw new Error('This chapter is locked and requires coins to read');
    const response = await http.get(absoluteUrl(this.baseUrl, chapter.url), { headers: this.rscHeaders() });
    const data = findRscObject<{ chapter: { pages?: { imageUrl?: string | null }[] } }>(
      response.body,
      (o) => 'chapter' in o && typeof o.chapter === 'object' && o.chapter !== null && 'pages' in (o.chapter as object),
    );
    return (data?.chapter.pages ?? [])
      .map((p) => (p.imageUrl ? absoluteUrl(this.baseUrl, p.imageUrl) : ''))
      .filter(Boolean)
      .map((imageUrl, index) => ({ index, imageUrl }));
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  // Filters
  async getFilters(): Promise<Filter[]> {
    const filters: Filter[] = [
      {
        type: 'select',
        id: 'sort',
        label: 'Sort',
        options: [
          option('Latest', 'updated'),
          option('Popular', 'popular'),
          option('Trending', 'trending'),
          option('Views', 'views'),
          option('Rating', 'rating'),
          option('Longest', 'longest'),
          option('Newest', 'newest'),
        ],
        default: 'updated',
      },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: [
          option('All', ''),
          ...['Ongoing', 'Completed', 'Hiatus', 'Dropped', 'Discontinued', 'Upcoming'].map((s) => option(s, s)),
        ],
      },
      {
        type: 'select',
        id: 'type',
        label: 'Type',
        options: [option('All', ''), option('Manhwa', 'MANHWA'), option('Manhua', 'MANHUA'), option('Manga', 'MANGA')],
      },
      {
        type: 'select',
        id: 'origin',
        label: 'Origin',
        options: [
          option('All', ''),
          option('Korean', 'KOREAN'),
          option('Japanese', 'JAPANESE'),
          option('Chinese', 'CHINESE'),
          option('Other', 'OTHER'),
        ],
      },
    ];
    try {
      const data = (
        await http.get<{ genres?: { name?: string; slug?: string; genre?: { slug?: string } | null }[] }>(
          `${this.baseUrl}/api/genres`,
          {
            headers: this.headers(),
            responseType: 'json',
          },
        )
      ).body;
      const genres = (data.genres ?? [])
        .map((g) => ({ label: stripEmoji(g.name ?? ''), value: g.slug || g.genre?.slug || '' }))
        .filter((g) => g.label && g.value);
      if (genres.length > 0) {
        filters.push({
          type: 'group',
          id: 'genre',
          label: 'Genre',
          filters: genres.map((g) => ({ type: 'checkbox', id: `genre.${g.value}`, label: g.label })),
        });
      }
    } catch (error) {
      log.warn('Cannot load genres', error);
    }
    return filters;
  }

  // URLs
  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/series\/comic\/([^/?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: `/series/comic/${match[2]}`, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return absoluteUrl(this.baseUrl, item.url.split('#')[0]!);
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
