import { defineExtension } from '@matane/extension-sdk';
import { Iken, SHOW_LOCKED_CHAPTERS_PREFERENCE } from './iken/Iken';

class KenScans extends Iken {
  readonly name = 'Ken Scans';
  readonly baseUrl = 'https://kencomics.com';
}

export default defineExtension({
  preferences: () => [SHOW_LOCKED_CHAPTERS_PREFERENCE],
  createSource: () => new KenScans().toSource(),
});
