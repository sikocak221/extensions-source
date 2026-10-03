import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class MangaReadorg extends Madara {
  readonly name = 'MangaRead.org';
  readonly baseUrl = 'https://www.mangaread.org';

  override chapterDatePattern = 'dd.MM.yyy';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new MangaReadorg().toSource(),
});
