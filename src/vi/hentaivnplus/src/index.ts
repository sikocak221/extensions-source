import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class HentaiVNplus extends Madara {
  readonly name = 'HentaiVN.plus';
  readonly baseUrl = 'https://hentaivn.show';

  override chapterDatePattern = 'dd/MM/yyyy';
  override mangaSubString = 'truyen-hentai';
  override pageListParseSelector = '.reading-content img';
}

export default defineExtension({
  createSource: () => new HentaiVNplus().toSource(),
});
