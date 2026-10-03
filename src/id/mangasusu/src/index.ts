import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class Mangasusu extends MangaThemesia {
  readonly name = 'Mangasusu';
  readonly baseUrl = 'https://mangasusuku.com';

  override mangaUrlDirectory = '/komik';
}

export default defineExtension({
  createSource: () => new Mangasusu().toSource(),
});
