import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class Mangafree extends Madara {
  readonly name = 'Mangafree';
  readonly baseUrl = 'https://mangafree.info';

  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new Mangafree().toSource(),
});
