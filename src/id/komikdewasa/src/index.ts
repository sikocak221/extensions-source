import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class KomikDewasa extends MangaThemesia {
  readonly name = 'Komik Dewasa';
  readonly baseUrl = 'https://komikdewasa.mom';

  override mangaUrlDirectory = '/komik';
  override datePattern = 'd MMMM yyyy';
  override hasProjectPage = true;
}

export default defineExtension({
  createSource: () => new KomikDewasa().toSource(),
});
