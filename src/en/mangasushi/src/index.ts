import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class Mangasushi extends Madara {
  readonly name = 'Mangasushi';
  readonly baseUrl = 'https://mangasushi.org';

  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new Mangasushi().toSource(),
});
