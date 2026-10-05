import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class SereinScan extends MangaThemesia {
  readonly name = 'Serein Scan';
  readonly baseUrl = 'https://sereinscan.com';
}

export default defineExtension({
  createSource: () => new SereinScan().toSource(),
});
