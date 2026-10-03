import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class KSGroupScans extends Madara {
  readonly name = 'KSGroupScans';
  readonly baseUrl = 'https://ksgroupscans.com';

  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new KSGroupScans().toSource(),
});
