import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class AkazaScans extends MangaThemesia {
  readonly name = 'Akaza Scans';
  readonly baseUrl = 'https://akazascans.org';
}

export default defineExtension({
  createSource: () => new AkazaScans().toSource(),
});
