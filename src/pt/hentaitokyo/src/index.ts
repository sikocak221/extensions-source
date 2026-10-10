import { defineExtension } from '@matane/extension-sdk';
import { Gattsu } from './gattsu/Gattsu';

class HentaiTokyo extends Gattsu {
  readonly name = 'Hentai Tokyo';
  readonly baseUrl = 'https://hentaitokyo.net';
}

export default defineExtension({
  createSource: () => new HentaiTokyo().toSource(),
});
