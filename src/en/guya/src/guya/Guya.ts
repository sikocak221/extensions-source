// Guya (Cubari-style readers), ported from keiyoushi/extensions-source lib-multisrc/guya. This directory is
// a template: every extension using the theme keeps an identical copy in src/guya/
// (`node scripts/sync-multisrc.mjs`).
//
// Manga urls are "/<slug>", chapter urls "/<slug>/<chapter number>#<group id>".
import type { Chapter, MangaDetails, MangaPage, MangaSummary, Page, Preference, Source } from '@matane/extension-sdk';
import { USER_AGENT, hostOf, htmlToText } from './utils';

export const PREFERRED_GROUP_PREFERENCE: Preference = {
  type: 'text',
  key: 'SCANLATOR_PREFERENCE',
  label: 'Preferred scanlator (group id)',
  description: "Group to prioritize; the next available one is used when it hasn't released a chapter.",
  default: '1',
};

interface SeriesDto {
  slug: string;
  title?: string | null;
  author?: string | null;
  artist?: string | null;
  description?: string | null;
  cover?: string | null;
  last_updated?: number | null;
}

interface SeriesDetailsDto extends SeriesDto {
  title: string;
  groups: Record<string, string>;
  chapters: Record<
    string,
    {
      title: string;
      folder: string;
      groups: Record<string, string[]>;
      release_date?: Record<string, number> | null;
      preferred_sort?: string[] | null;
    }
  >;
  preferred_sort?: string[] | null;
}

export abstract class Guya {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;

  headers(): Record<string, string> {
    return { 'User-Agent': this.userAgent, Referer: `${this.baseUrl}/` };
  }

  async api<T>(path: string): Promise<T> {
    return (await http.get<T>(`${this.baseUrl}${path}`, { headers: this.headers(), responseType: 'json' })).body;
  }

  /** Lets a site hide some series. */
  filterMangas(items: MangaSummary[]): MangaSummary[] {
    return items;
  }

  coverUrl(cover: string | null | undefined): string | undefined {
    if (!cover) return undefined;
    return cover.startsWith('http') ? cover : `${this.baseUrl}/${cover.replace(/^\/+/, '')}`;
  }

  toSummary(title: string, series: SeriesDto): MangaSummary {
    return { url: `/${series.slug}`, title, thumbnailUrl: this.coverUrl(series.cover) };
  }

  async allSeries(): Promise<[string, SeriesDto][]> {
    return Object.entries(await this.api<Record<string, SeriesDto>>('/api/get_all_series/'));
  }

  async getPopular(): Promise<MangaPage> {
    return {
      items: this.filterMangas((await this.allSeries()).map(([t, s]) => this.toSummary(t, s))),
      hasNextPage: false,
    };
  }

  async getLatest(): Promise<MangaPage> {
    const series = (await this.allSeries()).sort((a, b) => (b[1].last_updated ?? 0) - (a[1].last_updated ?? 0));
    return { items: this.filterMangas(series.map(([t, s]) => this.toSummary(t, s))), hasNextPage: false };
  }

  async search(query: string): Promise<MangaPage> {
    const q = query.trim();
    const series = (await this.allSeries()).filter(([title, s]) =>
      q.startsWith('slug:') ? s.slug === q.slice(5) : title.toLowerCase().includes(q.toLowerCase()),
    );
    return { items: this.filterMangas(series.map(([t, s]) => this.toSummary(t, s))), hasNextPage: false };
  }

  slugOf(url: string): string {
    return url.replace(/^\/+/, '').split(/[/#]/)[0] ?? '';
  }

  async fetchSeries(url: string): Promise<SeriesDetailsDto> {
    return this.api<SeriesDetailsDto>(`/api/series/${this.slugOf(url)}/`);
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    const series = await this.fetchSeries(manga.url);
    const description = series.description?.includes('<')
      ? htmlToText(series.description.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, ''))
      : series.description;
    return {
      url: manga.url,
      title: manga.title || series.title,
      author: series.author || undefined,
      artist: series.artist || undefined,
      description: description || undefined,
      thumbnailUrl: this.coverUrl(series.cover) ?? manga.thumbnailUrl,
      status: 'unknown',
    };
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const series = await this.fetchSeries(manga.url);
    const preferred = prefs.get<string>(PREFERRED_GROUP_PREFERENCE.key) ?? '1';
    const chapters: Chapter[] = [];
    for (const [number, chapter] of Object.entries(series.chapters)) {
      const sort = chapter.preferred_sort ?? series.preferred_sort;
      const groups = Object.keys(chapter.groups);
      const chosen = sort
        ? [groups.includes(preferred) ? preferred : (sort.find((g) => groups.includes(g)) ?? groups[0]!)]
        : groups;
      for (const group of chosen) {
        const date = chapter.release_date?.[group];
        chapters.push({
          url: `/${series.slug}/${number}#${group}`,
          name: `${number} - ${chapter.title}`,
          number: Number.parseFloat(number),
          scanlator: series.groups[group] ?? group,
          uploadedAt: date ? date * 1000 : undefined,
        });
      }
    }
    return chapters.reverse();
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const series = await this.fetchSeries(chapter.url);
    const [path, group = ''] = chapter.url.split('#');
    const number = path!.split('/').filter(Boolean)[1] ?? '';
    const data = series.chapters[number];
    if (!data) throw new Error('Chapter not found');
    const groupId = data.groups[group] ? group : Object.keys(data.groups)[0]!;
    return (data.groups[groupId] ?? []).map((file, index) => ({
      index,
      imageUrl: `${this.baseUrl}/media/manga/${series.slug}/chapters/${data.folder}/${groupId}/${file}`,
    }));
  }

  imageHeaders(): Record<string, string> {
    return this.headers();
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/(?:reader|read)\/(?:series|manga)\/([^/?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: `/${match[2]}`, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    const [path] = item.url.split('#');
    const parts = path!.split('/').filter(Boolean);
    if (parts.length >= 2) return `${this.baseUrl}/read/manga/${parts[0]}/${parts[1]!.replace(/\./g, '-')}/1/`;
    return `${this.baseUrl}/reader/series/${parts[0]}/`;
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
