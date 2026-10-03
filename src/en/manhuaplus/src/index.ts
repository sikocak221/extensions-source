import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class ManhuaPlus extends Madara {
  readonly name = 'Manhua Plus';
  readonly baseUrl = 'https://manhuaplus.com';

  override filterNonMangaItems = false;
  override pageListParseSelector = '.read-container img';
}

export default defineExtension({
  createSource: () => new ManhuaPlus().toSource(),
});
