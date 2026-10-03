import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class KokoMangas extends Madara {
  readonly name = 'KokoMangas';
  readonly baseUrl = 'https://kokomangas.com';

  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new KokoMangas().toSource(),
});
