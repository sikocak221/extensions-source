import { defineExtension } from '@matane/extension-sdk';
import { FansubsCat } from './fansubscat/FansubsCat';

class Hentaicat extends FansubsCat {
  readonly name = 'Hentai.cat';
  readonly baseUrl = 'https://manga.hentai.cat';
  readonly isHentaiSite = true;
}

export default defineExtension({
  createSource: () => new Hentaicat().toSource(),
});
