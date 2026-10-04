import { defineExtension } from '@matane/extension-sdk';
import { MadaraNoAjax } from './madara/MadaraNoAjax';

class PantheonScan extends MadaraNoAjax {
  readonly name = 'Pantheon Scan';
  readonly baseUrl = 'https://pantheon-scan.com';

  override chapterDatePattern = 'd MMMM yyyy';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new PantheonScan().toSource(),
});
