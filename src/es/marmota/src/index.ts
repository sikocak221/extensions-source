import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class Marmota extends Madara {
  readonly name = 'Marmota';
  readonly baseUrl = 'https://marmota.me';

  override chapterDatePattern = "d 'de' MMM 'de' yyyy";
  override mangaSubString = 'comic';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new Marmota().toSource(),
});
