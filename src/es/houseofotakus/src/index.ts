import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class HouseOfOtakus extends Madara {
  readonly name = 'House Of Otakus';
  readonly baseUrl = 'https://houseofotakusv2.xyz';

  override chapterMode = 'MangaAjax' as const;
  override chapterDatePattern = 'MMMM dd, yyyy';
}

export default defineExtension({
  createSource: () => new HouseOfOtakus().toSource(),
});
