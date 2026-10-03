// MonochromeCMS, ported from keiyoushi/extensions-source lib-multisrc/monochrome. This directory is a
// template: every extension using the theme keeps an identical copy in src/monochrome/
// (`node scripts/sync-multisrc.mjs`).
//
// Manga urls are "/manga/<uuid>", chapter urls "/chapters/<uuid>#<manga uuid>|<version>|<page count>".
import type { Chapter, MangaDetails, MangaPage, MangaStatus, MangaSummary, Page, Source } from '@matane/extension-sdk';
import { USER_AGENT, hostOf } from './utils';

interface MangaDto {
  title: string;
  description: string;
  author: string;
  artist: string;
  status: string;
  id: string;
  version: number;
}

export abstract class MonochromeCMS {
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  userAgent = USER_AGENT;

  get apiUrl(): string {
    return this.baseUrl.replace('://', '://api.');
  }

  async api<T>(path: string): Promise<T> {
    return (
      await http.get<T>(`${this.apiUrl}${path}`, { headers: { 'User-Agent': this.userAgent }, responseType: 'json' })
    ).body;
  }

  toDetails(manga: MangaDto): MangaDetails {
    const statuses: Record<string, MangaStatus> = {
      ongoing: 'ongoing',
      hiatus: 'hiatus',
      completed: 'completed',
      cancelled: 'cancelled',
    };
    return {
      url: `/manga/${manga.id}`,
      title: manga.title,
      author: manga.author || undefined,
      artist: manga.artist || undefined,
      description: manga.description || undefined,
      thumbnailUrl: `${this.apiUrl}/media/${manga.id}/cover.jpg?version=${manga.version}`,
      status: statuses[manga.status] ?? 'unknown',
    };
  }

  async getPopular(page: number): Promise<MangaPage> {
    return this.search('', page);
  }

  async search(query: string, page: number): Promise<MangaPage> {
    const data = await this.api<{ offset: number; limit: number; results: MangaDto[]; total: number }>(
      `/manga?limit=10&offset=${10 * (page - 1)}&title=${encodeURIComponent(query.trim())}`,
    );
    return {
      items: data.results.map((m) => {
        const { url, title, thumbnailUrl } = this.toDetails(m);
        return { url, title, thumbnailUrl };
      }),
      hasNextPage: data.total > data.results.length + data.offset * data.limit,
    };
  }

  idOf(url: string): string {
    return url.split('#')[0]!.split('/').filter(Boolean).pop() ?? '';
  }

  async getMangaDetails(manga: MangaSummary): Promise<MangaDetails> {
    return this.toDetails(await this.api<MangaDto>(`/manga/${this.idOf(manga.url)}`));
  }

  async getChapters(manga: MangaSummary): Promise<Chapter[]> {
    const chapters = await this.api<
      {
        name: string;
        volume?: number | null;
        number: number;
        scanGroup: string;
        id: string;
        version: number;
        length: number;
        uploadTime: string;
      }[]
    >(`/manga/${this.idOf(manga.url)}/chapters`);
    return chapters.map((c) => {
      const number = String(Math.round(c.number * 100) / 100);
      const time = Date.parse(c.uploadTime);
      return {
        url: `/chapters/${c.id}#${this.idOf(manga.url)}|${c.version}|${c.length}`,
        name: `${c.volume != null ? `Vol ${c.volume} ` : ''}Chapter ${number}${c.name ? ` - ${c.name}` : ''}`,
        number: c.number,
        scanlator: c.scanGroup || undefined,
        uploadedAt: Number.isFinite(time) ? time : undefined,
      };
    });
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const id = this.idOf(chapter.url);
    const [mangaId = '', version = '', length = '0'] = (chapter.url.split('#')[1] ?? '').split('|');
    return Array.from({ length: Number(length) }, (_, i) => ({
      index: i,
      imageUrl: `${this.apiUrl}/media/${mangaId}/${id}/${i + 1}.jpg?version=${version}`,
    }));
  }

  resolveUrl(url: string): MangaSummary | null {
    const match = /^https?:\/\/([^/?#]+)\/manga\/([^/?#]+)/i.exec(url.trim());
    if (!match || match[1]?.toLowerCase() !== hostOf(this.baseUrl)) return null;
    return { url: `/manga/${match[2]}`, title: '' };
  }

  getWebUrl(item: MangaSummary | Chapter): string {
    return `${this.baseUrl}${item.url.split('#')[0]}`;
  }

  toSource(): Source {
    return {
      baseUrl: this.baseUrl,
      getPopular: (page) => this.getPopular(page),
      search: (query, page) => this.search(query, page),
      getMangaDetails: (manga) => this.getMangaDetails(manga),
      getChapters: (manga) => this.getChapters(manga),
      getPages: (chapter) => this.getPages(chapter),
      resolveUrl: (url) => this.resolveUrl(url),
      getWebUrl: (item) => this.getWebUrl(item),
    };
  }
}
