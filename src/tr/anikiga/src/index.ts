import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class Anikiga extends Madara {
  readonly name = 'Anikiga';
  readonly baseUrl = 'https://anikiga.com';

  override chapterDatePattern = 'dd MMMM yyyy';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new Anikiga().toSource(),
});
