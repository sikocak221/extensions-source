import { defineExtension } from '@matane/extension-sdk';
import { ZeistManga } from './zeistmanga/ZeistManga';

class DarkRoomFansub extends ZeistManga {
  readonly name = 'Dark Room Fansub';
  readonly baseUrl = 'https://lector-darkroomfansub.blogspot.com';

  override supportsLatest = false;
  override mangaDetailsSelector = '#main';
  override pageListSelector = 'article#reader div.separator';
  override mangaDetailsSelectorDescription = '#synopsis';
  override mangaDetailsSelectorGenres = 'a[rel=tag]';
  override mangaDetailsSelectorInfoTitle = 'dt';
  override mangaDetailsSelectorInfoDescription = 'dd';
  override mangaDetailsSelectorInfo = '#extra-info > dl';
}

export default defineExtension({
  createSource: () => new DarkRoomFansub().toSource(),
});
