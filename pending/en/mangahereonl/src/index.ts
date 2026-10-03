import { defineExtension } from '@matane/extension-sdk';
import { MangaHub } from './mangahub/MangaHub';

class MangaHereonl extends MangaHub {
  readonly name = 'MangaHere.onl';
  readonly baseUrl = 'https://mangahere.onl';

  override mangaSource = 'mh01';
}

export default defineExtension({
  createSource: () => new MangaHereonl().toSource(),
});
