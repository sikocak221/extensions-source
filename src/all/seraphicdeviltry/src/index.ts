import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class SeraphicDeviltry extends Madara {
  readonly name = 'SeraphicDeviltry';
  readonly baseUrl = 'https://seraphic-deviltry.com';

  override chapterDatePattern = 'MM/dd/yyyy';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new SeraphicDeviltry().toSource(),
});
