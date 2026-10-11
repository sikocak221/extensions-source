import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class KodokuStudio extends Madara {
  readonly name = 'Kodoku Studio';
  readonly baseUrl = 'https://kodokustudio.com';

  override chapterMode = 'MangaAjax' as const;
  override mangaSubString = 'manhua';
}

export default defineExtension({
  createSource: () => new KodokuStudio().toSource(),
});
