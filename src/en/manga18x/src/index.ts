import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class Manga18x extends Madara {
  readonly name = 'Manga 18x';
  readonly baseUrl = 'https://manga18x.net';

  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new Manga18x().toSource(),
});
