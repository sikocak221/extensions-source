import { defineExtension } from '@matane/extension-sdk';
import { MangaHub } from './mangahub/MangaHub';

class MangaFoxfun extends MangaHub {
  readonly name = 'MangaFox.fun';
  readonly baseUrl = 'https://mangafox.fun';

  override mangaSource = 'mf01';
}

export default defineExtension({
  createSource: () => new MangaFoxfun().toSource(),
});
