import { defineExtension } from '@matane/extension-sdk';
import { Iken, SHOW_LOCKED_CHAPTERS_PREFERENCE } from './iken/Iken';

class SanaScans extends Iken {
  readonly name = 'Sana Scans';
  readonly baseUrl = 'https://sanascans.com';

  override perPage = 30;
  override sortPagesByFilename = true;
}

export default defineExtension({
  preferences: () => [SHOW_LOCKED_CHAPTERS_PREFERENCE],
  createSource: () => new SanaScans().toSource(),
});
