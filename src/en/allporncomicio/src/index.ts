import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class AllPornComicio extends Madara {
  readonly name = 'AllPornComic.io';
  readonly baseUrl = 'https://allporncomic.io';

  override chapterDatePattern = 'dd/MM/yyyy';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new AllPornComicio().toSource(),
});
