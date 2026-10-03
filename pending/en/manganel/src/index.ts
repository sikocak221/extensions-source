import { defineExtension } from '@matane/extension-sdk';
import { MangaHub } from './mangahub/MangaHub';

class MangaNel extends MangaHub {
  readonly name = 'MangaNel';
  readonly baseUrl = 'https://manganel.me';

  override mangaSource = 'mn05';
}

export default defineExtension({
  createSource: () => new MangaNel().toSource(),
});
