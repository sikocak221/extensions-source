import { defineExtension } from '@matane/extension-sdk';
import { ZeistManga } from './zeistmanga/ZeistManga';

class ShiyuraSub extends ZeistManga {
  readonly name = 'ShiyuraSub';
  readonly baseUrl = 'https://shiyurasub.blogspot.com';

  override hasFilters = true;
  override hasLanguageFilter = false;
  override supportsLatest = false;
  override mangaDetailsSelectorDescription = '#synopsis ~ p';
}

export default defineExtension({
  createSource: () => new ShiyuraSub().toSource(),
});
