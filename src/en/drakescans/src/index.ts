import { defineExtension } from '@matane/extension-sdk';
import { HIDE_LOCKED_CHAPTERS_PREFERENCE, VineTheme } from './vinetheme/VineTheme';

class DrakeScans extends VineTheme {
  readonly name = 'Drake Scans';
  readonly baseUrl = 'https://drakecomic.net';
}

export default defineExtension({
  preferences: () => [HIDE_LOCKED_CHAPTERS_PREFERENCE],
  createSource: () => new DrakeScans().toSource(),
});
