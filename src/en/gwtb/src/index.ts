import { type Chapter, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';

class GWTB extends SingleSeries {
  readonly name = 'Gone with the Blastwave';
  readonly baseUrl = 'https://www.blastwave-comic.com';
  readonly series = {
    url: '/index.php',
    title: 'Gone with the Blastwave',
    author: 'Kimmo Lemetti',
    artist: 'Kimmo Lemetti',
    thumbnailUrl: `${this.baseUrl}/images/yarr.jpg`,
    description: 'Because war can be boring too.',
    status: 'unknown' as const,
  };

  async getChapters(): Promise<Chapter[]> {
    const document = await this.fetchDocument(this.series.url);
    return document.select('.fall > option:not(:first-child)').map((option) => ({
      url: `/index.php?nro=${option.attr('value')}`,
      name: option.text().trim(),
      number: Number(option.attr('value')),
    }));
  }

  getPages(chapter: Chapter): Promise<Page[]> {
    return this.imagesOf(chapter, '.comic_title + img');
  }
}

export default defineExtension({
  createSource: () => new GWTB().toSource(),
});
