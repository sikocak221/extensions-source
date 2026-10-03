import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class MangaYY extends Madara {
  readonly name = 'MangaYY';
  readonly baseUrl = 'https://mangayy.org';

  override chapterDatePattern = 'dd MMMM, yyyy';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new MangaYY().toSource(),
});
