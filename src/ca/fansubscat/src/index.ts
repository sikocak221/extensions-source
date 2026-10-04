import { defineExtension } from '@matane/extension-sdk';
import { FansubsCat } from './fansubscat/FansubsCat';

class Fansubscat extends FansubsCat {
  readonly name = 'Fansubs.cat';
  readonly baseUrl = 'https://manga.fansubs.cat';
  readonly isHentaiSite = false;
}

export default defineExtension({
  createSource: () => new Fansubscat().toSource(),
});
