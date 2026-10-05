import { defineExtension } from '@matane/extension-sdk';
import { ZeistManga } from './zeistmanga/ZeistManga';

class MikrokosmosFansub extends ZeistManga {
  readonly name = 'Mikrokosmos Fansub';
  readonly baseUrl = 'https://mikrokosmosfb.blogspot.com';

  override pageListSelector = ':root';
}

export default defineExtension({
  createSource: () => new MikrokosmosFansub().toSource(),
});
