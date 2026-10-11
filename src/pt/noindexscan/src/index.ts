import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class HanamiHeaven extends Madara {
  readonly name = 'Hanami Heaven';
  readonly baseUrl = 'https://hanamiheaven.org';

  override chapterDatePattern = 'dd/MM/yyyy';
  override mangaDetailsSelectorTitle = 'div.post-title-test h1, div.post-title h1';
  override mangaDetailsSelectorStatus = 'div.summary-heading:has(h5:contains(Status)) + div.summary-content';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new HanamiHeaven().toSource(),
});
