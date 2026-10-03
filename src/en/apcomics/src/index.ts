import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class APComics extends Madara {
  readonly name = 'AP Comics';
  readonly baseUrl = 'https://apcomics.org';

  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new APComics().toSource(),
});
