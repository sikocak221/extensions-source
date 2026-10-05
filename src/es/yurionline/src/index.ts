import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class YuriOnline extends Madara {
  readonly name = 'Yuri-Online';
  readonly baseUrl = 'https://yuri-online.com';

  override chapterDatePattern = 'MMM dd, yyyy';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new YuriOnline().toSource(),
});
