import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class MangaOwliounoriginal extends Madara {
  readonly name = 'MangaOwl.io (unoriginal)';
  readonly baseUrl = 'https://mangaowl.io';

  override mangaSubString = 'read-1';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new MangaOwliounoriginal().toSource(),
});
