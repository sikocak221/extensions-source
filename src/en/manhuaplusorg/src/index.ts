import { defineExtension } from '@matane/extension-sdk';
import { Liliana } from './liliana/Liliana';

class ManhuaPlusUnoriginal extends Liliana {
  readonly name = 'ManhuaPlus (Unoriginal)';
  readonly baseUrl = 'https://manhuaplus.org';
}

export default defineExtension({
  createSource: () => new ManhuaPlusUnoriginal().toSource(),
});
