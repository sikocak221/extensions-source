import { defineExtension } from '@matane/extension-sdk';
import { MangaK } from './mangak/MangaK';

class MangaKSource extends MangaK {
  readonly name = 'MangaK';
  readonly baseUrl = 'https://mangak.io';
}

export default defineExtension({
  createSource: () => new MangaKSource().toSource(),
});
