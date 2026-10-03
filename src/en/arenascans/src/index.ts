import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class ArenaScans extends MangaThemesia {
  readonly name = 'Arena Scans';
  readonly baseUrl = 'https://arenascan.com';
}

export default defineExtension({
  createSource: () => new ArenaScans().toSource(),
});
