import { defineExtension } from '@matane/extension-sdk';
import { UzayManga } from './uzaymanga/UzayManga';

class AfroditScans extends UzayManga {
  readonly name = 'Afrodit Scans';
  readonly baseUrl = 'https://afroditscans.com';

  override cdnUrl = 'https://cdn-a.efsaneler2.can.re';
}

export default defineExtension({
  createSource: () => new AfroditScans().toSource(),
});
