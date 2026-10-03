import { type Chapter, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';
import { parseDate, relativeUrl } from './singleseries/utils';

class SwordsComic extends SingleSeries {
  readonly name = 'Swords Comic';
  readonly baseUrl = 'https://swordscomic.com';
  readonly series = {
    url: '/archive/pages/',
    title: 'Swords Comic',
    author: 'Matthew Wills',
    artist: 'Matthew Wills',
    status: 'ongoing' as const,
    description: 'A webcomic about swords and the heroes who wield them',
    thumbnailUrl: 'https://swordscomic.com/media/ArgoksEdgeEmote.png',
  };

  async getChapters(): Promise<Chapter[]> {
    const document = await this.fetchDocument(this.series.url);
    return document
      .select('a.archive-tile')
      .map((a) => ({
        url: relativeUrl(a.absUrl('href') || a.attr('href') || ''),
        name: a.selectFirst('strong')?.text() ?? '',
        uploadedAt: parseDate(a.selectFirst('small')?.text(), 'dd MMM yyyy'),
      }))
      .reverse();
  }

  // Not ported: the original also renders the image's title text as an extra page.
  getPages(chapter: Chapter): Promise<Page[]> {
    return this.imagesOf(chapter, 'img#comic-image');
  }
}

export default defineExtension({
  createSource: () => new SwordsComic().toSource(),
});
