import { defineExtension } from '@matane/extension-sdk';
import { MangaHub } from './mangahub/MangaHub';

class MangaPandaonl extends MangaHub {
  readonly name = 'MangaPanda.onl';
  readonly baseUrl = 'https://mangapanda.onl';

  override mangaSource = 'mr02';
}

export default defineExtension({
  createSource: () => new MangaPandaonl().toSource(),
});
