import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class LagoonScans extends MangaThemesia {
  readonly name = 'Lagoon Scans';
  readonly baseUrl = 'https://lagoonscans.com';
}

export default defineExtension({
  createSource: () => new LagoonScans().toSource(),
});
