import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class Kanzenin extends MangaThemesia {
  readonly name = 'Kanzenin';
  readonly baseUrl = 'https://kanzenin.info';
}

export default defineExtension({
  createSource: () => new Kanzenin().toSource(),
});
