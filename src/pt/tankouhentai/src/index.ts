import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class TankouHentai extends Madara {
  readonly name = "Tankou Hentai";
  readonly baseUrl = "https://tankouhentai.com";

  override chapterMode = 'MangaAjax' as const;
  override chapterDatePattern = 'dd \'de\' MMMM \'de\' yyyy';
}

export default defineExtension({
  createSource: () => new TankouHentai().toSource(),
});
