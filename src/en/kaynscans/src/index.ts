import { defineExtension } from '@matane/extension-sdk';
import { HIDE_LOCKED_CHAPTERS_PREFERENCE, VineTheme } from './vinetheme/VineTheme';

class KaynScans extends VineTheme {
  readonly name = 'Kayn Scans';
  readonly baseUrl = 'https://kaynscans.com';
}

export default defineExtension({
  preferences: () => [HIDE_LOCKED_CHAPTERS_PREFERENCE],
  createSource: () => new KaynScans().toSource(),
});
