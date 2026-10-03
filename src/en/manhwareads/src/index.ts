import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class ManhwaReads extends Madara {
  readonly name = 'Manhwa Reads';
  readonly baseUrl = 'https://manhwareads.com';

  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new ManhwaReads().toSource(),
});
