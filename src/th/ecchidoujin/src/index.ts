import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class EcchiDoujin extends MangaThemesia {
  readonly name = 'Ecchi-Doujin';
  readonly baseUrl = 'https://ecchi-doujin.com';

  override mangaUrlDirectory = '/doujin';
}

export default defineExtension({
  createSource: () => new EcchiDoujin().toSource(),
});
