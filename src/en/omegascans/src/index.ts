import { defineExtension } from '@matane/extension-sdk';
import { HeanCms, LOGIN_PREFERENCES, SHOW_PAID_CHAPTERS_PREFERENCE } from './heancms/HeanCms';

class OmegaScans extends HeanCms {
  readonly name = 'Omega Scans';
  readonly baseUrl = 'https://omegascans.org';

  override enableLogin = true;
}

export default defineExtension({
  preferences: () => [SHOW_PAID_CHAPTERS_PREFERENCE, ...LOGIN_PREFERENCES],
  createSource: () => new OmegaScans().toSource(),
});
