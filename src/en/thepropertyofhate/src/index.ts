import { type Chapter, type Page, defineExtension } from '@matane/extension-sdk';
import { SingleSeries } from './singleseries/SingleSeries';
import { relativeUrl } from './singleseries/utils';

class ThePropertyOfHate extends SingleSeries {
  readonly name = 'The Property of Hate';
  readonly baseUrl = 'https://jolleycomics.com';
  readonly series = {
    url: '/TPoH/',
    title: 'The Property of Hate',
    thumbnailUrl: 'https://jolleycomics.com/images/Index/tpoh.png',
    author: 'Sarah Jolley',
    artist: 'Sarah Jolley',
    status: 'unknown' as const,
  };

  // The jump box lists finished chapters in bold, then the pages of the current one.
  async getChapters(): Promise<Chapter[]> {
    const document = await this.fetchDocument(this.series.url);
    const chapters: Chapter[] = [];
    let addedCurrent = false;
    for (const option of document.select('select.jumpbox option:not([value="-1"])')) {
      const value = relativeUrl(option.absUrl('value') || option.attr('value') || '');
      if ((option.attr('style') ?? '').includes('bold')) {
        chapters.push({
          url: value,
          name: `#${chapters.length + 1} - ${option.text().trim()}`,
          number: chapters.length + 1,
        });
      } else if (!addedCurrent) {
        chapters.push({
          url: `${value.slice(0, value.lastIndexOf('/'))}/`,
          name: `#${chapters.length + 1} - ${option.text().split(' : Page')[0]!.trim()}`,
          number: chapters.length + 1,
        });
        addedCurrent = true;
      }
    }
    return chapters.reverse();
  }

  async getPages(chapter: Chapter): Promise<Page[]> {
    const document = await this.fetchDocument(chapter.url);
    return document
      .select('select.jumpbox option:not([style*=bold]):not([value="-1"])')
      .map((option, index) => ({ index, url: option.absUrl('value') || option.attr('value') || '' }));
  }

  override async getImageUrl(page: Page): Promise<string> {
    const img = (await this.fetchDocument(page.url ?? '')).selectFirst('.comic_comic > img');
    return img?.absUrl('src') || img?.attr('src') || '';
  }
}

export default defineExtension({
  createSource: () => new ThePropertyOfHate().toSource(),
});
