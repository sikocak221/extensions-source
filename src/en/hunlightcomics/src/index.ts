import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class HunlightComics extends Madara {
  readonly name = 'Hunlight Comics';
  readonly baseUrl = 'https://hunlightcomics.com';

  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new HunlightComics().toSource(),
});
