import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class MRTenzus extends Madara {
  readonly name = "MR Tenzus";
  readonly baseUrl = "https://mrtenzus.com";

  override chapterMode = 'MangaAjax' as const;
  override chapterDatePattern = 'MM/dd/yyyy';
}

export default defineExtension({
  createSource: () => new MRTenzus().toSource(),
});
