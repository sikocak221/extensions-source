import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class KuroManga extends MangaThemesia {
  readonly name = 'Kuro Manga';
  readonly baseUrl = 'https://kuromanga.id';
}

export default defineExtension({
  createSource: () => new KuroManga().toSource(),
});
