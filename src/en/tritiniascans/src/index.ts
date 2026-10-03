import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class TritiniaScans extends Madara {
  readonly name = 'TritiniaScans';
  readonly baseUrl = 'https://tritinia.org';

  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new TritiniaScans().toSource(),
});
