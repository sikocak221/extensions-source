import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class TortugaCeviri extends Madara {
  readonly name = 'Tortuga Ceviri';
  readonly baseUrl = 'https://tortugaceviri.com';

  override chapterDatePattern = 'MMM d, yyy';
}

export default defineExtension({
  createSource: () => new TortugaCeviri().toSource(),
});
