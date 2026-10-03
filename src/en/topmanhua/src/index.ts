import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class TopManhua extends Madara {
  readonly name = 'Top Manhua';
  readonly baseUrl = 'https://mangatop.org';

  override chapterMode = 'MangaAjaxPaginated' as const;
  override chapterDatePattern = 'MM/dd/yy';
  override filterNonMangaItems = false;
  override mangaSubString = 'series';
}

export default defineExtension({
  createSource: () => new TopManhua().toSource(),
});
