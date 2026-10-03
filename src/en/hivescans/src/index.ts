import { defineExtension } from '@matane/extension-sdk';
import { Iken, SHOW_LOCKED_CHAPTERS_PREFERENCE } from './iken/Iken';

class HiveScans extends Iken {
  readonly name = 'Hive Scans';
  readonly baseUrl = 'https://hivetoons.org';
}

export default defineExtension({
  preferences: () => [SHOW_LOCKED_CHAPTERS_PREFERENCE],
  createSource: () => new HiveScans().toSource(),
});
