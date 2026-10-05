import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class RyaManga extends Madara {
  readonly name = 'Rüya Manga';
  readonly baseUrl = 'https://www.ruyamanga2.com';

  override chapterDatePattern = 'dd/MM/yyyy';
  override filterNonMangaItems = false;
}

export default defineExtension({
  createSource: () => new RyaManga().toSource(),
});
