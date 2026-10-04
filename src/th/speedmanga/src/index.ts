import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class SpeedManga extends MangaThemesia {
  readonly name = 'Speed Manga';
  readonly baseUrl = 'https://speed-manga.net';
}

export default defineExtension({
  createSource: () => new SpeedManga().toSource(),
});
