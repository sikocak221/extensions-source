import { defineExtension } from '@matane/extension-sdk';
import { UzayManga } from './uzaymanga/UzayManga';

class LimonManga extends UzayManga {
  readonly name = 'Limon Manga';
  readonly baseUrl = 'https://limonmanga.com';

  override cdnUrl = 'https://cdn-l.efsaneler2.can.re';
}

export default defineExtension({
  createSource: () => new LimonManga().toSource(),
});
