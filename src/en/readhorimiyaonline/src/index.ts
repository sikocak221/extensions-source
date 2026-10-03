import {
  type Chapter,
  type HtmlElement,
  type MangaDetails,
  type MangaStatus,
  type Page,
  defineExtension,
} from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';
import { parseDate, relativeUrl } from './singleseries/utils';

class ReadHorimiyaOnline extends SingleSeries {
  readonly name = 'Read Horimiya Online';
  readonly baseUrl = 'https://read-horimiya.online';
  readonly series: MangaDetails = { url: '/', title: 'Horimiya', status: 'unknown' };

  override async getMangaDetails(): Promise<MangaDetails> {
    const document = await this.fetchDocument('/');
    const meta = (label: string) =>
      document
        .select('div.extra-manga-info-left p')
        .find((p) => p.text().toLowerCase().startsWith(label.toLowerCase()))
        ?.selectFirst('span')
        ?.text();
    const statuses: Record<string, MangaStatus> = { ongoing: 'ongoing', completed: 'completed', hiatus: 'hiatus' };
    const thumb = document.selectFirst('img.manga-thumb');
    return {
      ...this.series,
      thumbnailUrl: thumb?.absUrl('src') || undefined,
      description: document.selectFirst('span.desc')?.text(),
      genres: document.select('span.genre-list-item').map((e: HtmlElement) => e.text()),
      author: meta('Author(s)'),
      artist: meta('Artist(s)'),
      status: statuses[meta('Status')?.toLowerCase() ?? ''] ?? 'unknown',
    };
  }

  async getChapters(): Promise<Chapter[]> {
    const document = await this.fetchDocument('/');
    return document.select('div#chapter-list a.chapter-list-item').map((a) => ({
      url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
      name: a.selectFirst('span.chapter-name')?.text() || a.text(),
      uploadedAt: parseDate(a.selectFirst('span.chapter-date')?.text(), 'MMMM d, yyyy'),
    }));
  }

  getPages(chapter: Chapter): Promise<Page[]> {
    return this.imagesOf(chapter, 'div.images-container img');
  }
}

export default defineExtension({
  createSource: () => new ReadHorimiyaOnline().toSource(),
});
