import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class TanukiManga extends MangaThemesia {
  readonly name = 'Tanuki-Manga';
  readonly baseUrl = 'https://www.tanuki-manga.net';
}

export default defineExtension({
  createSource: () => new TanukiManga().toSource(),
});
