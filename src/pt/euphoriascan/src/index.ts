import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class EuphoriaScan extends Madara {
  readonly name = 'Euphoria Scan';
  readonly baseUrl = 'https://euphoriascan.com';

  override chapterDatePattern = "dd 'de' MMMM 'de' yyyy";
  override mangaDetailsSelectorStatus = 'div.summary-heading:contains(Status) + div.summary-content';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new EuphoriaScan().toSource(),
});
