import { defineExtension } from '@matane/extension-sdk';
import { MangaHub } from './mangahub/MangaHub';

class MangaToday extends MangaHub {
  readonly name = 'MangaToday';
  readonly baseUrl = 'https://mangatoday.fun';

  override mangaSource = 'm03';
}

export default defineExtension({
  createSource: () => new MangaToday().toSource(),
});
