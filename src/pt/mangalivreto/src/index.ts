import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class MangaLivreto extends Madara {
  readonly name = 'Manga Livre.to';
  readonly baseUrl = 'https://mangalivre.to';

  override chapterDatePattern = "dd 'de' MMMM 'de' yyyy";
  override chapterListSelector(): string {
    return '.listing-chapters-wrap .chapter-box';
  }
  override chapterDateSelector = '.chapter-date';
}

export default defineExtension({
  createSource: () => new MangaLivreto().toSource(),
});
