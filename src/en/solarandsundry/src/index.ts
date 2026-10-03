import { type Chapter, type MangaSummary, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';

// The source reads the comic's API; links open the reader site.
const ARCHIVE_URL = 'https://sas.ewanb.me';

interface SasPage {
  page_number: number;
  image_url: string;
  name: string;
  published_at: string;
}

class SolarAndSundry extends SingleSeries {
  readonly name = 'Solar and Sundry';
  readonly baseUrl = 'https://sas-api.fly.dev';
  readonly series = {
    url: '/page',
    title: 'Solar and Sundry',
    author: 'Ewan Breakey',
    artist: 'Ewan Breakey',
    status: 'ongoing' as const,
    description: 'a sci-fi horror webcomic about life blooming against all odds',
    thumbnailUrl: 'https://imagedelivery.net/zthi1l8fKrUGB5ig08mq-Q/de292ba7-f164-4f43-ec17-1876a7a44600/public',
  };

  async api<T>(path: string): Promise<T> {
    return (await http.get<T>(`${this.baseUrl}${path}`, { headers: this.headers(), responseType: 'json' })).body;
  }

  async getChapters(): Promise<Chapter[]> {
    const pages = await this.api<SasPage[]>(this.series.url);
    return pages
      .map((page) => {
        const time = Date.parse(page.published_at);
        return {
          url: `/page/${page.page_number}`,
          name: page.name,
          number: page.page_number,
          uploadedAt: Number.isFinite(time) ? time : undefined,
        };
      })
      .reverse();
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    return [{ index: 0, imageUrl: (await this.api<SasPage>(chapter.url)).image_url }];
  }

  override imageHeaders(): Record<string, string> {
    return { ...this.headers(), Accept: 'image/avif,image/webp,image/*,*/*' };
  }

  override resolveUrl(url: string): MangaSummary | null {
    return /^https?:\/\/(sas\.ewanb\.me|sas-api\.fly\.dev)(\/|$)/i.test(url.trim()) ? this.summary() : null;
  }

  override getWebUrl(item: MangaSummary | Chapter): string {
    return item.url.startsWith('/page/') ? `${ARCHIVE_URL}/comic/${item.url.split('/').pop()}` : ARCHIVE_URL;
  }
}

export default defineExtension({
  createSource: () => new SolarAndSundry().toSource(),
});
