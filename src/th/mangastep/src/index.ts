import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class Mangastep extends MangaThemesia {
  readonly name = 'Mangastep';
  readonly baseUrl = 'https://mangastep.com';
}

export default defineExtension({
  createSource: () => new Mangastep().toSource(),
});
