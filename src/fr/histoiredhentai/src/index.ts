import { defineExtension } from '@matane/extension-sdk';
import { MadaraNoAjax } from './madara/MadaraNoAjax';

class HistoireDHentai extends MadaraNoAjax {
  readonly name = 'HistoireDHentai';
  readonly baseUrl = 'https://hhentai.fr';

  override chapterDatePattern = 'MMMM d, yyyy';
}

export default defineExtension({
  createSource: () => new HistoireDHentai().toSource(),
});
