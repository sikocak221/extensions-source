import { defineExtension } from '@matane/extension-sdk';
import { ZeistManga } from './zeistmanga/ZeistManga';

class Ler999 extends ZeistManga {
  readonly name = 'Ler 999';
  readonly baseUrl = 'https://ler999.blogspot.com';
}

export default defineExtension({
  createSource: () => new Ler999().toSource(),
});
