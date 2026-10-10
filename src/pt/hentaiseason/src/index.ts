import { defineExtension } from '@matane/extension-sdk';
import { Gattsu } from './gattsu/Gattsu';

class HentaiSeason extends Gattsu {
  readonly name = 'Hentai Season';
  readonly baseUrl = 'https://hentaiseason.com';
}

export default defineExtension({
  createSource: () => new HentaiSeason().toSource(),
});
