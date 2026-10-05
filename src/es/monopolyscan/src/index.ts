import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class MonopolyScan extends Madara {
  readonly name = 'Monopoly Scan';
  readonly baseUrl = 'https://monopolymanhua.com';

  override chapterDatePattern = 'MMMM d, yyyy';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => ({ ...new MonopolyScan().toSource(), transformImage: () => ({}) }),
});
