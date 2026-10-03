import { defineExtension } from '@matane/extension-sdk';
import { MangaK } from './mangak/MangaK';

class Toonilyme extends MangaK {
  readonly name = 'Toonily.me';
  readonly baseUrl = 'https://toontop.io';
}

export default defineExtension({
  createSource: () => new Toonilyme().toSource(),
});
