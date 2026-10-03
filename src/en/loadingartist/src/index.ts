import { type Chapter, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';
import { parseDate, relativeUrl } from './singleseries/utils';

class LoadingArtist extends SingleSeries {
  readonly name = 'Loading Artist';
  readonly baseUrl = 'https://loadingartist.com';
  readonly series = {
    url: '/archives',
    title: 'Loading Artist',
    thumbnailUrl: `${this.baseUrl}/img/bg/logo-text_dark.png`,
    author: 'Loading Artist',
    artist: 'Loading Artist',
    status: 'ongoing' as const,
  };

  async getChapters(): Promise<Chapter[]> {
    const comics = (
      await http.get<{ url: string; title: string; date?: string; section: string }[]>(`${this.baseUrl}/search.json`, {
        headers: this.headers(),
        responseType: 'json',
      })
    ).body;
    return comics
      .filter((c) => ['comic', 'game', 'art'].includes(c.section))
      .map((c) => ({ url: relativeUrl(c.url), name: c.title, uploadedAt: parseDate(c.date, 'yyyy-MM-dd') }));
  }

  getPages(chapter: Chapter): Promise<Page[]> {
    return this.imagesOf(chapter, 'div.main-image-container img');
  }
}

export default defineExtension({
  createSource: () => new LoadingArtist().toSource(),
});
