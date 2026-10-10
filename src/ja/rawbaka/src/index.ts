import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class RawBaka extends Madara {
  readonly name = 'RawBaka';
  readonly baseUrl = 'https://rawbaka.com';

  override filterNonMangaItems = false;
  override chapterMode = 'MangaAjax' as const;
}

export default defineExtension({
  createSource: () => new RawBaka().toSource(),
});
