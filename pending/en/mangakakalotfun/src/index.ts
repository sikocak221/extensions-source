import { defineExtension } from '@matane/extension-sdk';
import { MangaHub } from './mangahub/MangaHub';

class Mangakakalotfun extends MangaHub {
  readonly name = 'Mangakakalot.fun';
  readonly baseUrl = 'https://mangakakalot.fun';

  override mangaSource = 'mn01';
}

export default defineExtension({
  createSource: () => new Mangakakalotfun().toSource(),
});
