import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class DespairManga extends MangaThemesia {
  readonly name = 'Despair Manga';
  readonly baseUrl = 'https://despair-world.com';
}

export default defineExtension({
  createSource: () => new DespairManga().toSource(),
});
