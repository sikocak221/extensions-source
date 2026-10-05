import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class ApollComics extends Madara {
  readonly name = 'ApollComics';
  readonly baseUrl = 'https://apollcomics.es';

  override chapterDatePattern = 'MMMM d, yyyy';
  // The image host answers 403 to the site's Referer.
  override imageHeaders(): Record<string, string> {
    return { 'User-Agent': this.userAgent };
  }
}

export default defineExtension({
  createSource: () => new ApollComics().toSource(),
});
