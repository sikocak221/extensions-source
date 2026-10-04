import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class HizoManga extends Madara {
  readonly name = 'HizoManga';
  readonly baseUrl = 'https://hizomanga.net';

  override chapterDatePattern = 'yyyy-MM-dd';
  override mangaSubString = 'serie';
  override mangaDetailsSelectorDescription = '.manga-excerpt';
  override mangaDetailsSelectorStatus = '.manga-status';
}

export default defineExtension({
  createSource: () => new HizoManga().toSource(),
});
