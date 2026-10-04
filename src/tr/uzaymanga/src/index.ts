import { defineExtension } from '@matane/extension-sdk';
import { UzayManga } from './uzaymanga/UzayManga';

class UzayMangaSource extends UzayManga {
  readonly name = 'Uzay Manga';
  readonly baseUrl = 'https://uzaymanga.com';

  override cdnUrl = 'https://cdn-u.efsaneler2.can.re';
}

export default defineExtension({
  createSource: () => new UzayMangaSource().toSource(),
});
