import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class Truyentranhdammy extends Madara {
  readonly name = 'Truyen tranh dam my';
  readonly baseUrl = 'https://truyentranhdammyy.site';

  override chapterDatePattern = 'MMMM d, yyyy';
  override chapterMode = 'AdminAjax' as const;
}

export default defineExtension({
  createSource: () => new Truyentranhdammy().toSource(),
});
