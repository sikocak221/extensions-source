import { defineExtension } from '@matane/extension-sdk';
import { UzayManga } from './uzaymanga/UzayManga';

class ElderManga extends UzayManga {
  readonly name = 'Elder Manga';
  readonly baseUrl = 'https://eldermanga.com';

  override cdnUrl = 'https://cdn-el.efsaneler2.can.re';
}

export default defineExtension({
  createSource: () => new ElderManga().toSource(),
});
