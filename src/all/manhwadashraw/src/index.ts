import { defineExtension } from '@matane/extension-sdk';
import { MadaraNoAjax } from './madara/MadaraNoAjax';

class Manhwaraw extends MadaraNoAjax {
  readonly name = 'Manhwa-raw';
  readonly baseUrl = 'https://manhwa-raw.com';

  override chapterDatePattern = 'dd/MM/yyyy';
  override mangaDetailsSelectorStatus = 'div.post-content_item:contains(Status) > div.summary-content';
  override mangaDetailsSelectorDescription = 'div.post-content_item:contains(Summary) div.summary-container';
  override pageListParseSelector = 'div.page-break img.wp-manga-chapter-img';
}

export default defineExtension({
  createSource: () => new Manhwaraw().toSource(),
});
