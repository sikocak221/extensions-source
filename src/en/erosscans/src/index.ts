import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class ScytheScans extends MangaThemesia {
  readonly name = 'Scythe Scans';
  readonly baseUrl = 'https://scythescans.com';
}

export default defineExtension({
  createSource: () => new ScytheScans().toSource(),
});
