import { defineExtension } from '@matane/extension-sdk';
import { MangAdventure } from './mangadventure/MangAdventure';

class AssortedScans extends MangAdventure {
  readonly name = 'Assorted Scans';
  readonly baseUrl = 'https://assortedscans.com';
}

export default defineExtension({
  createSource: () => new AssortedScans().toSource(),
});
