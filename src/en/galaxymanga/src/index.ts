import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class GalaxyManga extends MangaThemesia {
  readonly name = 'Galaxy Manga';
  readonly baseUrl = 'https://galaxymanga.io';
}

export default defineExtension({
  createSource: () => new GalaxyManga().toSource(),
});
