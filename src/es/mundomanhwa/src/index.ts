import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class MundoManhwa extends Madara {
  readonly name = 'Mundo Manhwa';
  readonly baseUrl = 'https://mundomanhwa.com';

  override chapterMode = 'MangaAjax' as const;
  override chapterDatePattern = 'MMMM d, yyyy';
  // The image host answers 403 to the site's Referer.
  override imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.userAgent };
  }
}

export default defineExtension({
  createSource: () => new MundoManhwa().toSource(),
});
