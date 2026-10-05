import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class AsiaLotus extends MangaThemesia {
  readonly name = 'Asia Lotus';
  readonly baseUrl = 'https://asialotuss.com';
}

export default defineExtension({
  createSource: () => new AsiaLotus().toSource(),
});
