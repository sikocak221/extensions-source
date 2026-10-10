import { type MangaSummary, defineExtension } from '@matane/extension-sdk';
import { GigaViewer, HIDE_LOCKED_PREFERENCE, HIDE_UNAVAILABLE_PREFERENCE } from './gigaviewer/GigaViewer';

class SundayWebEvery extends GigaViewer {
  readonly name = 'Sunday Web Every';
  readonly baseUrl = 'https://www.sunday-webry.com';

  override seriesListIds = [
    '3269754496454696025',
    '3269754496454696029',
    '3269754496454696030',
    '3269754496454696040',
    '3269754496454696045',
    '3269754496454696049',
    '3269754496454696050',
    '3269754496576310217',
    '3269754496454696059',
  ];

  override filterOptions(): [string, string[]][] {
    return [
      ['連載作品', this.seriesListIds],
      ['読切', ['3269754496400962241']],
      ['夜サンデー', []],
    ];
  }

  override async fetchCollection(ids: string[]): Promise<MangaSummary[]> {
    if (ids.length > 0) return super.fetchCollection(ids);
    const document = await this.fetchDocument(`${this.baseUrl}/series/yoru-sunday`);
    return document.select('ul.webry-series-list li a.webry-series-item-link').flatMap((link): MangaSummary[] => {
      const title = link.selectFirst('h4.series-title')?.text();
      const href = link.absUrl('href');
      if (!title || !href) return [];
      const thumbnailUrl = link.selectFirst('div.thumb-wrapper img')?.absUrl('data-src');
      return [{ url: this.setSeriesUrl(href, thumbnailUrl), title, thumbnailUrl }];
    });
  }
}

export default defineExtension({
  preferences: () => [HIDE_LOCKED_PREFERENCE, HIDE_UNAVAILABLE_PREFERENCE],
  createSource: () => new SundayWebEvery().toSource(),
});
