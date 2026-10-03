import { defineExtension } from '@matane/extension-sdk';
import { Keyoapp, SHOW_PAID_CHAPTERS_PREFERENCE } from './keyoapp/Keyoapp';

class GrimScans extends Keyoapp {
  readonly name = 'Grim Scans';
  readonly baseUrl = 'https://grimscans.com';
}

export default defineExtension({
  preferences: () => [SHOW_PAID_CHAPTERS_PREFERENCE],
  createSource: () => new GrimScans().toSource(),
});
