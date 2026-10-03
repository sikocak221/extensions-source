import { defineExtension } from '@matane/extension-sdk';
import { Iken, SHOW_LOCKED_CHAPTERS_PREFERENCE } from './iken/Iken';

class VortexScans extends Iken {
  readonly name = 'Vortex Scans';
  readonly baseUrl = 'https://vortexscans.org';
}

export default defineExtension({
  preferences: () => [SHOW_LOCKED_CHAPTERS_PREFERENCE],
  createSource: () => new VortexScans().toSource(),
});
