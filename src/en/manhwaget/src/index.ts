import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class ManhwaGet extends Madara {
  readonly name = 'ManhwaGet';
  readonly baseUrl = 'https://manhwaget.com';

  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new ManhwaGet().toSource(),
});
