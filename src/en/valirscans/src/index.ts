import { defineExtension } from '@matane/extension-sdk';
import { HIDE_LOCKED_CHAPTERS_PREFERENCE, VineTheme } from './vinetheme/VineTheme';

class ValirScans extends VineTheme {
  readonly name = 'Valir Scans';
  readonly baseUrl = 'https://valirscans.org';
}

export default defineExtension({
  preferences: () => [HIDE_LOCKED_CHAPTERS_PREFERENCE],
  createSource: () => new ValirScans().toSource(),
});
