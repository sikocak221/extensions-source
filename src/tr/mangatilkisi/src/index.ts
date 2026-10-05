import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class MangaTilkisi extends Madara {
  readonly name = 'MangaTilkisi';
  readonly baseUrl = 'https://www.tilkiscans.com';

  override chapterDatePattern = 'dd/MM/yyyy';
  override chapterMode = 'MangaAjax' as const;
  override chapterUrlSelector = 'a:not(.chapter-thumbnail)';
}

export default defineExtension({
  createSource: () => new MangaTilkisi().toSource(),
});
