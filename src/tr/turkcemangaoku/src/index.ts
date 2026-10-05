import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class TrkeMangaOku extends Madara {
  readonly name = 'Türkçe Manga Oku';
  readonly baseUrl = 'https://trmangaoku.com';

  override chapterDatePattern = 'd MMMM yyyy';
  override mangaDetailsSelectorStatus = 'div.summary-heading:contains(Durumu) + div.summary-content';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new TrkeMangaOku().toSource(),
});
