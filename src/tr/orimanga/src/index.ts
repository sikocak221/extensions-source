import { defineExtension } from '@matane/extension-sdk';
import { InitManga } from './initmanga/InitManga';

class OriManga extends InitManga {
  readonly name = 'Ori Manga';
  readonly baseUrl = 'https://orimanga.net';

  override mangaUrlDirectory = 'manga';
  override popularUrlSlug = 'manga-siralamasi';
  override latestUrlSlug = 'yakin-zamanda-guncellendi';
}

export default defineExtension({
  createSource: () => new OriManga().toSource(),
});
