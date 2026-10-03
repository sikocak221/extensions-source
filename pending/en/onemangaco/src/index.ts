import { defineExtension } from '@matane/extension-sdk';
import { MangaHub } from './mangahub/MangaHub';

class _1Mangaco extends MangaHub {
  readonly name = '1Manga.co';
  readonly baseUrl = 'https://1manga.co';

  override mangaSource = 'mn03';
}

export default defineExtension({
  createSource: () => new _1Mangaco().toSource(),
});
