import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class RagnarokScanlation extends Madara {
  readonly name = 'Ragnarok Scanlation';
  readonly baseUrl = 'https://ragnarokscanlation.org';

  override mangaSubString = 'series';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new RagnarokScanlation().toSource(),
});
