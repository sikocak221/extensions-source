import { defineExtension } from '@matane/extension-sdk';
import { MadaraNoAjax } from './madara/MadaraNoAjax';

class CovenScan extends MadaraNoAjax {
  readonly name = 'Coven Scan';
  readonly baseUrl = 'https://covendasbruxonas.com';

  override chapterMode = 'MangaAjax' as const;
  override mangaDetailsSelectorAuthor = 'div.post-content_item:contains(Author) > div.summary-content';
  override supportsFilterFetching = false;
}

export default defineExtension({
  createSource: () => new CovenScan().toSource(),
});
