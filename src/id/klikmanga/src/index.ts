import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class KlikManga extends Madara {
  readonly name = 'KlikManga';
  readonly baseUrl = 'https://klikmanga.org';

  override chapterDatePattern = 'MMMM dd, yyyy';
  override mangaSubString = 'daftar-komik';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new KlikManga().toSource(),
});
