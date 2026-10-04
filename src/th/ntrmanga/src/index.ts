import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class NTRManga extends MangaThemesia {
  readonly name = 'NTR-Manga';
  readonly baseUrl = 'https://www.ntr-manga.net';
}

export default defineExtension({
  createSource: () => new NTRManga().toSource(),
});
