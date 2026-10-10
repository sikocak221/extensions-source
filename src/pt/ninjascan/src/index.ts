import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class NinjaScan extends Madara {
  readonly name = "Ninja Scan";
  readonly baseUrl = "https://ninjacomics.xyz";

  override chapterMode = 'MangaAjax' as const;
  override chapterDatePattern = 'dd \'de\' MMMM \'de\' yyyy';
}

export default defineExtension({
  createSource: () => new NinjaScan().toSource(),
});
