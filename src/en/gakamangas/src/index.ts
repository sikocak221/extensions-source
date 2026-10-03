import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class GakaMangas extends Madara {
  readonly name = 'GakaMangas';
  readonly baseUrl = 'https://gakamangas.com';

  override filterNonMangaItems = false;
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new GakaMangas().toSource(),
});
