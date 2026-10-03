import { defineExtension } from '@matane/extension-sdk';
import { HIDE_LOCKED_CHAPTERS_PREFERENCE, VineTheme } from './vinetheme/VineTheme';

class DivaScans extends VineTheme {
  readonly name = 'Diva Scans';
  readonly baseUrl = 'https://divascans.org';
}

export default defineExtension({
  preferences: () => [HIDE_LOCKED_CHAPTERS_PREFERENCE],
  createSource: () => new DivaScans().toSource(),
});
