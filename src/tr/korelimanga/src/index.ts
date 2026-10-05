import { defineExtension } from '@matane/extension-sdk';
import { InitManga } from './initmanga/InitManga';

class KoreliManga extends InitManga {
  readonly name = 'Koreli Manga';
  readonly baseUrl = 'https://korelimanga.com';

  override mangaUrlDirectory = 'manga';
  override popularUrlSlug = 'manga-ranking';
  override latestUrlSlug = 'recently-updated';
  override chapterPagePathSegment = 'chapter';
}

export default defineExtension({
  createSource: () => new KoreliManga().toSource(),
});
