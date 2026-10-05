import { defineExtension } from '@matane/extension-sdk';
import { UzayManga } from './uzaymanga/UzayManga';

class TenshiManga extends UzayManga {
  readonly name = 'Tenshi Manga';
  readonly baseUrl = 'https://tenshimanga.com';

  override cdnUrl = 'https://cdn-t.efsaneler2.can.re';
}

export default defineExtension({
  createSource: () => new TenshiManga().toSource(),
});
