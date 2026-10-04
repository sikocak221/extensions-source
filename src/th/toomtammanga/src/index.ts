import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class ToomTamManga extends MangaThemesia {
  readonly name = 'ToomTam-Manga';
  readonly baseUrl = 'https://toomtam-manga.com';

  override seriesAuthorSelector = '.imptdt:contains(ผู้เขียน) i';
  override seriesArtistSelector = '.imptdt:contains(ศิลปิน) i';
  override seriesTypeSelector = '.imptdt:contains(พิมพ์) a';
}

export default defineExtension({
  createSource: () => new ToomTamManga().toSource(),
});
