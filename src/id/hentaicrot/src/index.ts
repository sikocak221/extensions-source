import { defineExtension } from '@matane/extension-sdk';
import { OceanWP } from './oceanwp/OceanWP';

class HentaiCrot extends OceanWP {
  readonly name = 'Hentai Crot';
  readonly baseUrl = 'https://hentaicrot.com';
}

export default defineExtension({
  createSource: () => new HentaiCrot().toSource(),
});
