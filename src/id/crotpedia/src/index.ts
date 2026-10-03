import { defineExtension } from '@matane/extension-sdk';
import { ZManga } from './zmanga/ZManga';

class CrotPedia extends ZManga {
  readonly name = 'CrotPedia';
  readonly baseUrl = 'https://crotpedia.net';

  override datePattern = 'MMMM dd, yyyy';
}

export default defineExtension({
  createSource: () => new CrotPedia().toSource(),
});
