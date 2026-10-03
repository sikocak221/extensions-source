import { defineExtension } from '@matane/extension-sdk';
import { ZManga } from './zmanga/ZManga';

class MaidManga extends ZManga {
  readonly name = 'Maid - Manga';
  readonly baseUrl = 'https://www.maid.my.id';

  override hasProjectPage = true;
}

export default defineExtension({
  createSource: () => new MaidManga().toSource(),
});
