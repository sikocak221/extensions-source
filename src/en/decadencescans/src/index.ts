import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class DecadenceScans extends Madara {
  readonly name = 'Decadence Scans';
  readonly baseUrl = 'https://reader.decadencescans.com';

  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new DecadenceScans().toSource(),
});
