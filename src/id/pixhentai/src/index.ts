import { defineExtension } from '@matane/extension-sdk';
import { OceanWP } from './oceanwp/OceanWP';

class PixHentai extends OceanWP {
  readonly name = 'Pix Hentai';
  readonly baseUrl = 'https://pixhentai.com';

  override hasTagFilter = false;
}

export default defineExtension({
  createSource: () => new PixHentai().toSource(),
});
