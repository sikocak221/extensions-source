import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class Dojingnet extends MangaThemesia {
  readonly name = 'Dojing.net';
  readonly baseUrl = 'https://dojing.net';
}

export default defineExtension({
  createSource: () => new Dojingnet().toSource(),
});
