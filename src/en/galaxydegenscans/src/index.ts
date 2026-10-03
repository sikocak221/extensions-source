import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class GalaxyDegenScans extends Madara {
  readonly name = 'GalaxyDegenScans';
  readonly baseUrl = 'https://gdscans.com';

  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new GalaxyDegenScans().toSource(),
});
