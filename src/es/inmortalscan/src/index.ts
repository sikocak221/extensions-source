import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class InmortalScan extends Madara {
  readonly name = 'Inmortal Scan';
  readonly baseUrl = 'https://scan-inmortal.com';

  override chapterDatePattern = 'MMMM d, yyyy';
  override mangaSubString = 'mg';
  override chapterMode = 'MangaAjax' as const;
  override supportsFilterFetching = false;
  override mangaDetailsSelectorTitle = 'h1';
  override mangaDetailsSelectorStatus = 'span.scanim-series-status';
  override mangaDetailsSelectorDescription = 'div.scanim-series-description p:not(.scanim-seo-info p)';
  override mangaDetailsSelectorThumbnail = 'div.scanim-series-cover img';
  override mangaDetailsSelectorGenre = "a[href*='manga-genre']";
  override altNameSelector = 'p.scanim-series-alternative';
  override chapterListSelector(): string {
    return 'li.wp-manga-chapter:not(.premium-block)';
  }
}

export default defineExtension({
  createSource: () => new InmortalScan().toSource(),
});
