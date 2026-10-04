import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class ParadiseBL extends Madara {
  readonly name = 'Paradise BL';
  readonly baseUrl = 'https://paradise-bl.com';

  override chapterMode = 'MangaAjax' as const;
  override mangaDetailsSelectorTitle = '.new-post-title h3 a';
}

export default defineExtension({
  createSource: () => new ParadiseBL().toSource(),
});
