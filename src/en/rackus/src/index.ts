import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class Rackus extends MangaThemesia {
  readonly name = 'Rackus';
  readonly baseUrl = 'https://rackusreads.com';
}

export default defineExtension({
  createSource: () => new Rackus().toSource(),
});
