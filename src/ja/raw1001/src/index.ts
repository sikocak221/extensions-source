import { defineExtension } from '@matane/extension-sdk';
import { Liliana } from './liliana/Liliana';

class Raw1001 extends Liliana {
  readonly name = 'Raw1001';
  readonly baseUrl = 'https://raw1001.net';
}

export default defineExtension({
  createSource: () => new Raw1001().toSource(),
});
