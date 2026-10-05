import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class YaoiFlix extends Madara {
  readonly name = 'Yaoi Flix';
  readonly baseUrl = 'https://yaoiflix.fit';

  override chapterDatePattern = 'MMMM dd, yyyy';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new YaoiFlix().toSource(),
});
