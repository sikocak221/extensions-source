import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class LianScans extends MangaThemesia {
  readonly name = 'LianScans';
  readonly baseUrl = 'https://www.lianscans.com';
}

export default defineExtension({
  createSource: () => new LianScans().toSource(),
});
