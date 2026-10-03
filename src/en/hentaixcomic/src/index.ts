import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class HentaiXComic extends Madara {
  readonly name = 'HentaiXComic';
  readonly baseUrl = 'https://hentaixcomic.com';

  override chapterDatePattern = 'MMM d, yyyy';
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new HentaiXComic().toSource(),
});
