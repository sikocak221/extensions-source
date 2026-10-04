import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class HentaiScantrad extends Madara {
  readonly name = 'Hentai-Scantrad';
  readonly baseUrl = 'https://hentai-scantrad.org';

  override chapterDatePattern = 'd MMMM, yyyy';
  override mangaDetailsSelectorStatus = 'div.summary-heading:contains(État) + .summary-content';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new HentaiScantrad().toSource(),
});
