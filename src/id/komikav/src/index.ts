import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class APKOMIK extends MangaThemesia {
  readonly name = 'APKOMIK';
  readonly baseUrl = 'https://01.apkomik.com';
}

export default defineExtension({
  createSource: () => new APKOMIK().toSource(),
});
