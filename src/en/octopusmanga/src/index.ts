import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class OctopusManga extends Madara {
  readonly name = 'OctopusManga';
  readonly baseUrl = 'https://octopusmanga.com';

  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new OctopusManga().toSource(),
});
