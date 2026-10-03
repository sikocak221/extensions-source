import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class ManhwaToon extends Madara {
  readonly name = 'Manhwa Toon';
  readonly baseUrl = 'https://www.manhwatoon.me';

  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new ManhwaToon().toSource(),
});
