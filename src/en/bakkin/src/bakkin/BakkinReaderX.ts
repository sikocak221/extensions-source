// BakkinReaderX, ported from keiyoushi/extensions-source lib-multisrc/bakkin. This directory is a template:
// every extension using the theme keeps an identical copy in src/bakkin/ (`node scripts/sync-multisrc.mjs`).
//
// One JSON document (main.php) lists every series with its volumes, chapters and pages.
// Manga urls are "/<series dir>", chapter urls "/<series>/<volume>/<chapter>".
import type {
  Chapter,
  MangaDetails,
  MangaPage,
  MangaStatus,
  MangaSummary,
  Page,
  Preference,
  Source,
} from '@matane/extension-sdk';
import { USER_AGENT, hostOf } from './utils';

export const IMAGE_QUALITY_PREFERENCE: Preference = {
  type: 'select',
  key: 'quality',
  label: 'Image quality',
  options: [
    { label: 'Original', value: '?fullsize' },
    { label: 'Compressed', value: '' },
  ],
  default: '',
};

interface SeriesDto {
  dir: string;
  name: string;
  author?: string | null;
  status?: string | null;
  thumb?: string | null;
  volumes: { dir: string; name: string; chapters: { dir: string; name: string; pages: string[] }[] }[];
}

export abstract class BakkinReaderX {
  abstract readonly name: string;
  /** Ends with "/" (the reader lives in a directory). */
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;
  private cache: SeriesDto[] | null = null;

  async allSeries(): Promise<SeriesDto[]> {
    if (!this.cache) {
      const quality = prefs.get<string>(IMAGE_QUALITY_PREFERENCE.key) ?? '';
      const data = (
        await http.get<Record<string, SeriesDto>>(`${this.baseUrl}main.php${quality}`, {
          headers: { 'User-Agent': this.userAgent },
          responseType: 'json',
        })
      ).body;
      this.cache = Object.values(data);
    }
    return this.cache;
  }

  async series(url: string): Promise<SeriesDto> {
    const dir = url.replace(/^\/+/, '').split('/')[0];
    const found = (await this.allSeries()).find((s) => s.dir === dir);
    if (!found) throw new Error('Series not found');
    return found;
  }

  title(series: SeriesDto): string {
    return series.name || series.dir;
  }

  toDetails(series: SeriesDto): MangaDetails {
    const statuses: Record<string, MangaStatus> = { Ongoing: 'ongoing', Completed: 'completed' };
    return {
      url: `/${series.dir}`,
      title: this.title(series),
      thumbnailUrl: this.baseUrl + (series.thumb ?? 'static/nocover.png'),
      author: series.author || undefined,
      status: statuses[series.status ?? ''] ?? 'unknown',
    };
  }

  async getPopular(): Promise<MangaPage> {
    return this.search('');
  }

  async search(query: string): Promise<MangaPage> {
    const q = query.trim().toLowerCase();
    const items = (await this.allSeries())
      .filter((s) => !q || this.title(s).toLowerCase().includes(q))
      .map((s) => {
        const { url, title, thumbnailUrl } = this.toDetails(s);
        return { url, title, thumbnailUrl };
      });
    return { items, hasNextPage: false };
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    return this.toDetails(await this.series(manga.url));
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const series = await this.series(manga.url);
    return series.volumes
      .flatMap((volume) =>
        volume.chapters.map((chapter) => ({
          url: `/${series.dir}/${volume.dir}/${chapter.dir}`,
          name: `${volume.name || volume.dir} - ${chapter.name || chapter.dir}`,
          number: Number.parseFloat(chapter.dir.split('c').pop() ?? '') || undefined,
        })),
      )
      .reverse();
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const [seriesDir, volumeDir, chapterDir] = chapter.url.replace(/^\/+/, '').split('/');
    const series = await this.series(`/${seriesDir}`);
    const pages =
      series.volumes.find((v) => v.dir === volumeDir)?.chapters.find((c) => c.dir === chapterDir)?.pages ?? [];
    return pages.map((path, index) => ({ index, imageUrl: this.baseUrl + path }));
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)[^#]*#(?:.*&)?m=([^&]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: `/${decodeURIComponent(match[2]!)}`, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    const [m, v, c] = item.url.replace(/^\/+/, '').split('/');
    return v ? `${this.baseUrl}#m=${m}&v=${v}&c=${c}` : `${this.baseUrl}#m=${m}`;
  }

  toSource(): Source {
    return {
      baseUrl: this.baseUrl,
      getPopular: () => this.getPopular(),
      search: (query) => this.search(query),
      getMangaDetails: (manga) => this.getMangaDetails(manga),
      getChapters: (manga) => this.getChapters(manga),
      getPages: (chapter) => this.getPages(chapter),
      resolveUrl: (url) => this.resolveUrl(url),
      getWebUrl: (item) => this.getWebUrl(item),
    };
  }
}
