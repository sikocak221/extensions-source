import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class VerManhwas extends Madara {
  readonly name = 'Ver Manhwas';
  readonly baseUrl = 'https://vermanhwa.com';

  override chapterDatePattern = 'MMMM d, yyyy';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new VerManhwas().toSource(),
});
