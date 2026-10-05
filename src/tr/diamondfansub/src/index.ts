import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class DiamondFansub extends Madara {
  readonly name = 'DiamondFansub';
  readonly baseUrl = 'https://diamondfansub.com';

  override chapterDatePattern = 'MMMM d, yyyy';
  override chapterDateSelector = '.chapter-release-date .timediff';
  override mangaSubString = 'seri';
  override chapterMode = 'MangaAjax' as const;
  override mangaDetailsSelectorAuthor = '.manga-authors';
  override mangaDetailsSelectorDescription = '.manga-info';
}

export default defineExtension({
  createSource: () => new DiamondFansub().toSource(),
});
