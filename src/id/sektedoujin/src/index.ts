import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class SekteDoujin extends MangaThemesia {
  readonly name = 'Sekte Doujin';
  readonly baseUrl = 'https://sektedoujin.cc';
}

export default defineExtension({
  createSource: () => new SekteDoujin().toSource(),
});
