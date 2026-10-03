// MangAdventure (JSON API v2), ported from keiyoushi/extensions-source lib-multisrc/mangadventure. This
// directory is a template: every extension using the theme keeps an identical copy in src/mangadventure/
// (`node scripts/sync-multisrc.mjs`).
//
// Manga urls are "/reader/<slug>/", chapter urls "/chapters/<id>".
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
import { USER_AGENT, hostOf, withQuery } from './utils';

export const DEFAULT_CATEGORIES = [
  '4-Koma',
  'Action',
  'Adventure',
  'Comedy',
  'Doujinshi',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Gender Bender',
  'Harem',
  'Hentai',
  'Historical',
  'Horror',
  'Josei',
  'Martial Arts',
  'Mecha',
  'Mystery',
  'Psychological',
  'Romance',
  'School Life',
  'Sci-Fi',
  'Seinen',
  'Shoujo',
  'Shoujo Ai',
  'Shounen',
  'Shounen Ai',
  'Slice of Life',
  'Smut',
  'Sports',
  'Supernatural',
  'Tragedy',
  'Yaoi',
  'Yuri',
];

interface SeriesDto {
  slug: string;
  title: string;
  cover: string;
  description?: string | null;
  status?: string | null;
  licensed?: boolean | null;
  aliases?: string[] | null;
  authors?: string[] | null;
  artists?: string[] | null;
  categories?: string[] | null;
}

export abstract class MangAdventure {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;
  categories = DEFAULT_CATEGORIES;

  get apiUrl(): string {
    return `${this.baseUrl}/api/v2`;
  }

  async api<T>(url: string): Promise<T> {
    return (await http.get<T>(url, { headers: { 'User-Agent': this.userAgent }, responseType: 'json' })).body;
  }

  async seriesList(url: string): Promise<MangaPage> {
    const data = await this.api<{ last: boolean; results: SeriesDto[] }>(url);
    return {
      items: data.results.map((s) => ({ url: `/reader/${s.slug}/`, title: s.title, thumbnailUrl: s.cover })),
      hasNextPage: !data.last,
    };
  }

  getPopular(page: number): Promise<MangaPage> {
    return this.seriesList(`${this.apiUrl}/series?page=${page}&sort=-views`);
  }

  getLatest(page: number): Promise<MangaPage> {
    return this.seriesList(`${this.apiUrl}/series?page=${page}&sort=-latest_upload`);
  }

  search(query: string, page: number, filters: FilterState): Promise<MangaPage> {
    const text = (id: string) => (typeof filters[id] === 'string' ? (filters[id] as string) : '');
    const sort = filters.sort;
    const categories = Object.entries(filters)
      .filter(([id, value]) => id.startsWith('category.') && (value === 'include' || value === 'exclude'))
      .map(([id, value]) => `${value === 'exclude' ? '-' : ''}${id.slice('category.'.length)}`);
    return this.seriesList(
      withQuery(`${this.apiUrl}/series`, {
        page: String(page),
        title: query.trim(),
        author: text('author') || undefined,
        artist: text('artist') || undefined,
        status: text('status') || undefined,
        sort: typeof sort === 'object' && sort.value ? `${sort.ascending ? '' : '-'}${sort.value}` : undefined,
        categories: categories.join(',') || undefined,
      }),
    );
  }

  slugOf(url: string): string {
    return url.split('/').filter(Boolean)[1] ?? '';
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const s = await this.api<SeriesDto>(`${this.apiUrl}/series/${this.slugOf(manga.url)}`);
    const statuses: Record<string, MangaStatus> = {
      completed: 'completed',
      ongoing: 'ongoing',
      hiatus: 'hiatus',
      canceled: 'cancelled',
    };
    let description = s.description ?? '';
    if (s.aliases?.length) description += `\n\nAlternative titles:\n${s.aliases.join('\n')}`;
    return {
      url: manga.url,
      title: s.title,
      thumbnailUrl: s.cover,
      description: description.trim() || undefined,
      author: s.authors?.join(', ') || undefined,
      artist: s.artists?.join(', ') || undefined,
      genres: s.categories ?? undefined,
      status: statuses[s.status ?? ''] ?? 'unknown',
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const data = await this.api<{
      results: {
        id: number;
        number: number;
        published: string;
        final: boolean;
        groups: string[];
        full_title: string;
      }[];
    }>(`${this.apiUrl}/series/${this.slugOf(manga.url)}/chapters?date_format=timestamp`);
    return data.results.map((c) => ({
      url: `/chapters/${c.id}`,
      name: `${c.full_title}${c.final ? ' [END]' : ''}`,
      number: c.number,
      uploadedAt: Number(c.published) || undefined,
      scanlator: c.groups.join(', ') || undefined,
    }));
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const data = await this.api<{ results: { image: string; number: number }[] }>(
      `${this.apiUrl}${chapter.url}/pages?track=true`,
    );
    return data.results.map((page, index) => ({ index, imageUrl: page.image }));
  }

  getFilters(): Filter[] {
    const options = (labels: string[], values: string[]) => labels.map((label, i) => ({ label, value: values[i]! }));
    return [
      { type: 'text', id: 'author', label: 'Author' },
      { type: 'text', id: 'artist', label: 'Artist' },
      {
        type: 'select',
        id: 'status',
        label: 'Status',
        options: options(
          ['Any', 'Completed', 'Ongoing', 'Hiatus', 'Cancelled'],
          ['', 'completed', 'ongoing', 'hiatus', 'canceled'],
        ),
      },
      {
        type: 'sort',
        id: 'sort',
        label: 'Sort',
        options: options(
          ['Title', 'Views', 'Latest upload', 'Chapter count'],
          ['title', 'views', 'latest_upload', 'chapter_count'],
        ),
      },
      {
        type: 'group',
        id: 'category',
        label: 'Categories',
        filters: this.categories.map((c) => ({ type: 'tristate', id: `category.${c}`, label: c })),
      },
    ];
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/reader\/([^/?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: `/reader/${match[2]}/`, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return item.url.startsWith('/chapters/') ? `${this.apiUrl}${item.url}/read` : `${this.baseUrl}${item.url}`;
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
      resolveUrl: (url) => this.resolveUrl(url),
      getWebUrl: (item) => this.getWebUrl(item),
    };
  }
}
