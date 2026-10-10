import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class NocturneSummer extends Madara {
  readonly name = "Nocturne Summer";
  readonly baseUrl = "https://nocfsb.com";

  override chapterDatePattern = 'dd \'de\' MMMM \'de\' yyyy';
  override mangaDetailsSelectorStatus = 'div.post-content_item:contains(Estado) > div.summary-content';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new NocturneSummer().toSource(),
});
