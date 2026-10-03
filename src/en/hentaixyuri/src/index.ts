import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class HentaiXYuri extends Madara {
  readonly name = 'HentaiXYuri';
  readonly baseUrl = 'https://hentaixyuri.com';

  override chapterDatePattern = 'MMM d, yyyy';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new HentaiXYuri().toSource(),
});
