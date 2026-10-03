import { defineExtension } from '@matane/extension-sdk';
import { MangaHub } from './mangahub/MangaHub';

class OneMangainfo extends MangaHub {
  readonly name = 'OneManga.info';
  readonly baseUrl = 'https://onemanga.info';

  override mangaSource = 'mh01';
}

export default defineExtension({
  createSource: () => new OneMangainfo().toSource(),
});
