import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class ManhwaComics extends Madara {
  readonly name = 'Manhwa Comics';
  readonly baseUrl = 'https://manhwacomics.com';

  override mangaSubString = 'manhwa';
  override chapterMode = 'MangaAjax' as const;
  override chapterDatePattern = 'd MMM yyyy';
}

export default defineExtension({
  createSource: () => new ManhwaComics().toSource(),
});
