import { defineExtension } from '@matane/extension-sdk';
import { Hwalumi } from './hwalumi/Hwalumi';

class LumosKomik extends Hwalumi {
  readonly name = 'LumosKomik';
  readonly baseUrl = 'https://03.lumosgg.com';
}

export default defineExtension({
  createSource: () => new LumosKomik().toSource(),
});
