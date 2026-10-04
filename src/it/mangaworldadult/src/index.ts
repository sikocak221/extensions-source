import { defineExtension } from '@matane/extension-sdk';
import { MangaWorld } from './mangaworld/MangaWorld';

class MangaworldAdult extends MangaWorld {
  readonly name = 'MangaworldAdult';
  readonly baseUrl = 'https://www.mangaworldadult.net';
}

export default defineExtension({
  createSource: () => new MangaworldAdult().toSource(),
});
