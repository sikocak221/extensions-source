import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class NebulosaScan extends Madara {
  readonly name = "Nebulosa Scan";
  readonly baseUrl = "https://nebulosascan.com";

  override chapterMode = 'MangaAjax' as const;
  override chapterDatePattern = 'MM/dd/yyyy';
}

export default defineExtension({
  createSource: () => new NebulosaScan().toSource(),
});
