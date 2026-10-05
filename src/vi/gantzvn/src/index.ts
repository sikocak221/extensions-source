import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class GantzVN extends Madara {
  readonly name = 'GantzVN';
  readonly baseUrl = 'https://gantzvn.com';

  override chapterDatePattern = 'dd/MM/yyyy';
  override mangaSubString = 'truyen';
}

export default defineExtension({
  createSource: () => new GantzVN().toSource(),
});
