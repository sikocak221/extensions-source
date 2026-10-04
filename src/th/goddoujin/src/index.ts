import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class GodDoujin extends MangaThemesia {
  readonly name = 'God-Doujin';
  readonly baseUrl = 'https://god-doujin.com';

  override seriesTypeSelector = '.imptdt:contains(ประเภท) a';
}

export default defineExtension({
  createSource: () => new GodDoujin().toSource(),
});
