import { defineExtension } from '@matane/extension-sdk';
import { Iken, SHOW_LOCKED_CHAPTERS_PREFERENCE } from './iken/Iken';

class OrionScans extends Iken {
  readonly name = 'Orion Scans';
  readonly baseUrl = 'https://orion-scans.com';
}

export default defineExtension({
  preferences: () => [SHOW_LOCKED_CHAPTERS_PREFERENCE],
  createSource: () => new OrionScans().toSource(),
});
