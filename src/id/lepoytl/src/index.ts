import { defineExtension } from '@matane/extension-sdk';
import { ZeistManga } from './zeistmanga/ZeistManga';

class LepoyTL extends ZeistManga {
  readonly name = 'LepoyTL';
  readonly baseUrl = 'https://www.lepoytl.my.id';

  override popularMangaSelector = 'div.PopularPosts div.grid > article';
  override popularMangaSelectorTitle = 'h3 > a';
  override popularMangaSelectorUrl = 'h3 > a';
  override mangaDetailsSelector = 'main';
  override mangaDetailsSelectorGenres = 'aside dl a[rel=tag]';
  override mangaDetailsSelectorInfo = '#extra-info dl';
  override mangaDetailsSelectorInfoTitle = 'dt';
  override mangaDetailsSelectorInfoDescription = 'dd';
  override pageListSelector = '#reader';
}

export default defineExtension({
  createSource: () => new LepoyTL().toSource(),
});
