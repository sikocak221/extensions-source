import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class ArthurScan extends Madara {
  readonly name = 'Arthur Scan';
  readonly baseUrl = 'https://arthurscan.xyz';

  override chapterDatePattern = 'MMMM d, yyyy';
  override chapterMode = 'MangaAjax' as const;
  override filterGenresSelector = '.genre-item';
}

export default defineExtension({
  createSource: () => new ArthurScan().toSource(),
});
