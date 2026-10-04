import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class SlowManga extends MangaThemesia {
  readonly name = 'Slow Manga';
  readonly baseUrl = 'https://www.slow-manga.net';
}

export default defineExtension({
  createSource: () => new SlowManga().toSource(),
});
