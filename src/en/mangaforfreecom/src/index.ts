import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class Mangaforfreecom extends Madara {
  readonly name = 'Mangaforfree.com';
  readonly baseUrl = 'https://mangaforfree.com';

  override chapterMode = 'AdminAjax' as const;
}

export default defineExtension({
  createSource: () => new Mangaforfreecom().toSource(),
});
