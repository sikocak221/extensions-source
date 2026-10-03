import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class Manga18Free extends Madara {
  readonly name = 'Manga18Free';
  readonly baseUrl = 'https://manga18free.com';

  override chapterMode = 'AdminAjax' as const;
}

export default defineExtension({
  createSource: () => new Manga18Free().toSource(),
});
