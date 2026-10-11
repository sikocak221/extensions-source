import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class MangaCrazy extends Madara {
  readonly name = 'MangaCrazy';
  readonly baseUrl = 'https://mangacrazy.net';

  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new MangaCrazy().toSource(),
});
