import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class MangaWOW extends Madara {
  readonly name = 'MangaWOW';
  readonly baseUrl = 'https://mangawow.org';

  override chapterDatePattern = 'dd MMMM yyyy';
}

export default defineExtension({
  createSource: () => new MangaWOW().toSource(),
});
