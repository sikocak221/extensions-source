import { defineExtension } from '@matane/extension-sdk';
import { HIDE_LOCKED_CHAPTERS_PREFERENCE, VineTheme } from './vinetheme/VineTheme';

class WitchScans extends VineTheme {
  readonly name = 'WitchScans';
  readonly baseUrl = 'https://witchtoons.net';
}

export default defineExtension({
  preferences: () => [HIDE_LOCKED_CHAPTERS_PREFERENCE],
  createSource: () => new WitchScans().toSource(),
});
