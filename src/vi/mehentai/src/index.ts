import { defineExtension } from '@matane/extension-sdk';
import { ManhwaZ } from './manhwaz/ManhwaZ';

class MeHentai extends ManhwaZ {
  readonly name = 'MeHentai';
  readonly baseUrl = 'https://mehentai.live';

  override lang = 'vi' as const;
  override mangaDetailsAuthorHeading = 'Tác giả';
  override mangaDetailsStatusHeading = 'Trạng thái';
  override searchPath = 'tim-kiem';

  override popularMangaSelector() {
    return '.main-content .item';
  }
}

export default defineExtension({
  createSource: () => new MeHentai().toSource(),
});
