import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class LHTranslation extends Madara {
  readonly name = 'LHTranslation';
  readonly baseUrl = 'https://lhtranslation.net';

  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new LHTranslation().toSource(),
});
