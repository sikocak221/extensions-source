import { defineExtension } from '@matane/extension-sdk';
import { MangaBox } from './mangabox/MangaBox';

class Mangabat extends MangaBox {
  readonly name = 'Mangabat';
  readonly baseUrl = 'https://www.mangabats.com';
}

export default defineExtension({
  createSource: () => new Mangabat().toSource(),
});
