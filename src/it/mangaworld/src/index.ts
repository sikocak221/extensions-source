import { defineExtension } from '@matane/extension-sdk';
import { MangaWorld } from './mangaworld/MangaWorld';

class Mangaworld extends MangaWorld {
  readonly name = 'Mangaworld';
  readonly baseUrl = 'https://www.mangaworld.mx';
}

export default defineExtension({
  createSource: () => new Mangaworld().toSource(),
});
