import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class FleurBlanche extends Madara {
  readonly name = 'Fleur Blanche';
  readonly baseUrl = 'https://fbsquadx.com';

  override chapterDatePattern = 'dd/MM/yyyy';
  override chapterMode = 'MangaAjax' as const;
  override mangaDetailsSelectorStatus = 'div.post-content_item:contains(Status) > div.summary-content';
}

export default defineExtension({
  createSource: () => new FleurBlanche().toSource(),
});
