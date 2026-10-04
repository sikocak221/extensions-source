import { defineExtension } from '@matane/extension-sdk';
import { ZeistManga } from './zeistmanga/ZeistManga';

class XSanoManga extends ZeistManga {
  readonly name = 'XSano Manga';
  readonly baseUrl = 'https://www.xsano-manga.com';

  override supportsLatest = false;
  override mangaDetailsSelector = 'main';
  override mangaDetailsSelectorGenres = 'dl a[rel=tag]';
  override mangaDetailsSelectorInfo = '#extra-info dl';
  override mangaDetailsSelectorInfoTitle = 'dt';
  override mangaDetailsSelectorInfoDescription = 'dd';
  override pageListSelector = '#reader div.separator';
}

export default defineExtension({
  createSource: () => new XSanoManga().toSource(),
});
