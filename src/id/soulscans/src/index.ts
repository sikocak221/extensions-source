import { defineExtension } from '@matane/extension-sdk';
import { LoneSeal } from './loneseal/LoneSeal';

class SoulScans extends LoneSeal {
  readonly name = 'Soul Scans';
  readonly baseUrl = 'https://v1.soulscans.org';

  override urlLayout = 'LEGACY_COMIC' as const;
  override includeProjectOnlyFilter = true;

  override get apiUrl(): string {
    return `${this.baseUrl}/api`;
  }
}

export default defineExtension({
  createSource: () => new SoulScans().toSource(),
});
