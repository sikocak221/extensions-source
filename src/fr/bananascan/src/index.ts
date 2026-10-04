import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class HarmonyScan extends Madara {
  readonly name = 'Harmony-Scan';
  readonly baseUrl = 'https://harmony-scan.fr';

  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new HarmonyScan().toSource(),
});
