// PizzaReader (JSON API), ported from keiyoushi/extensions-source lib-multisrc/pizzareader. This directory
// is a template: every extension using the theme keeps an identical copy in src/pizzareader/
// (`node scripts/sync-multisrc.mjs`).
//
// Manga urls are the comic's api path ("/comics/<slug>"), chapter urls the chapter's ("/comics/<slug>/<ch>").
import type { Chapter, MangaDetails, MangaPage, MangaStatus, MangaSummary, Page, Source } from '@matane/extension-sdk';
import { USER_AGENT, hostOf } from './utils';

interface ComicDto {
  artist?: string | null;
  author?: string | null;
  chapters?: ChapterDto[];
  description?: string | null;
  genres?: { name?: string }[];
  last_chapter?: ChapterDto | null;
  status?: string | null;
  title?: string;
  thumbnail?: string;
  url?: string;
}

interface ChapterDto {
  chapter?: number | null;
  full_title?: string;
  pages?: string[];
  published_on?: string;
  subchapter?: number | null;
  teams?: ({ name?: string } | null)[];
  url?: string;
}

export abstract class PizzaReader {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;
  apiPath = '/api';

  get apiUrl(): string {
    return `${this.baseUrl}${this.apiPath}`;
  }

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  async api<T>(path: string): Promise<T> {
    return (await http.get<T>(`${this.apiUrl}${path}`, { headers: this.headers(), responseType: 'json' })).body;
  }

  popularMangaFromObject(comic: ComicDto): MangaSummary {
    return { url: comic.url ?? '', title: comic.title ?? '', thumbnailUrl: comic.thumbnail || undefined };
  }

  async getPopular(): Promise<MangaPage> {
    const result = await this.api<{ comics?: ComicDto[] }>('/comics');
    return { items: (result.comics ?? []).map((c) => this.popularMangaFromObject(c)), hasNextPage: false };
  }

  async getLatest(): Promise<MangaPage> {
    const result = await this.api<{ comics?: ComicDto[] }>('/comics');
    const items = (result.comics ?? [])
      .filter((c) => c.last_chapter)
      .sort((a, b) => (b.last_chapter!.published_on ?? '').localeCompare(a.last_chapter!.published_on ?? ''))
      .slice(0, 10)
      .map((c) => this.popularMangaFromObject(c));
    return { items, hasNextPage: false };
  }

  async search(query: string): Promise<MangaPage> {
    // The api answers 404 to a path segment with an encoded slash.
    const result = await this.api<{ comics?: ComicDto[] }>(`/search/${encodeURIComponent(query.replace(/\//g, ' '))}`);
    return { items: (result.comics ?? []).map((c) => this.popularMangaFromObject(c)), hasNextPage: false };
  }

  async fetchComic(manga: MangaSummary): Promise<ComicDto> {
    const result = await this.api<{ comic?: ComicDto }>(manga.url);
    if (!result.comic) throw new Error('Comic not found');
    return result.comic;
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const comic = await this.fetchComic(manga);
    return {
      url: manga.url,
      title: comic.title || manga.title,
      author: comic.author || undefined,
      artist: comic.artist || undefined,
      description: comic.description || undefined,
      genres: (comic.genres ?? []).map((g) => g.name ?? '').filter(Boolean),
      status: comic.status ? this.toStatus(comic.status) : 'unknown',
      thumbnailUrl: comic.thumbnail || manga.thumbnailUrl,
    };
  }

  chapterFromObject(chapter: ChapterDto): Chapter {
    const scanlator = (chapter.teams ?? [])
      .filter((t) => t)
      .map((t) => t!.name)
      .join(' & ');
    return {
      url: chapter.url ?? '',
      name: chapter.full_title ?? '',
      number: (chapter.chapter ?? -1) + Number.parseFloat(`0.${chapter.subchapter ?? 0}`),
      scanlator: scanlator || undefined,
      uploadedAt: this.toDate(chapter.published_on ?? ''),
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const comic = await this.fetchComic(manga);
    return (comic.chapters ?? []).map((c) => this.chapterFromObject(c));
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const result = await this.api<{ chapter?: ChapterDto }>(chapter.url);
    if (!result.chapter) throw new Error('Chapter not found');
    return (result.chapter.pages ?? []).map((imageUrl, index) => ({ index, imageUrl }));
  }

  toDate(value: string): number | undefined {
    const time = Date.parse(value);
    return Number.isNaN(time) ? undefined : time;
  }

  toStatus(value: string): MangaStatus {
    switch (value.slice(0, 7)) {
      case 'In cors':
      case 'On goin':
        return 'ongoing';
      case 'Complet':
      case 'Conclus':
      case 'Conclud':
        return 'completed';
      default:
        return 'unknown';
    }
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/(?:comics|api\/comics)\/([^/?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: `/comics/${match[2]}`, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return `${this.baseUrl}${item.url}`;
  }

  toSource(): Source {
    return {
      baseUrl: this.baseUrl,
      getPopular: () => this.getPopular(),
      getLatest: () => this.getLatest(),
      search: (query) => this.search(query),
      getMangaDetails: (manga) => this.getMangaDetails(manga),
      getChapters: (manga) => this.getChapters(manga),
      getPages: (chapter) => this.getPages(chapter),
      imageHeaders: () => this.imageHeaders(),
      resolveUrl: (url) => this.resolveUrl(url),
      getWebUrl: (item) => this.getWebUrl(item),
    };
  }
}
