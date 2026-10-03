import { defineExtension } from '@matane/extension-sdk';
import { Keyoapp, SHOW_PAID_CHAPTERS_PREFERENCE } from './keyoapp/Keyoapp';

class KewnScans extends Keyoapp {
  readonly name = 'Kewn Scans';
  readonly baseUrl = 'https://kewnscans.org';
}

export default defineExtension({
  preferences: () => [SHOW_PAID_CHAPTERS_PREFERENCE],
  createSource: () => new KewnScans().toSource(),
});
