import { defineExtension } from '@matane/extension-sdk';
import { UzayManga } from './uzaymanga/UzayManga';

class EskiMangalar extends UzayManga {
  readonly name = 'Eski Mangalar';
  readonly baseUrl = 'https://eskimangalar.com';

  override cdnUrl = 'https://cdn-es.efsaneler2.can.re';
}

export default defineExtension({
  createSource: () => new EskiMangalar().toSource(),
});
