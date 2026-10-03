import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class AsterScans extends MangaThemesia {
  readonly name = 'Aster Scans';
  readonly baseUrl = 'https://asterscans.com';
}

export default defineExtension({
  createSource: () => new AsterScans().toSource(),
});
