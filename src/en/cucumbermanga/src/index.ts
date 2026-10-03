import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class CucumberManga extends Madara {
  readonly name = 'Cucumber Manga';
  readonly baseUrl = 'https://cucumbermanga.com';

  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new CucumberManga().toSource(),
});
