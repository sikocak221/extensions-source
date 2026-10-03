import { defineExtension } from '@matane/extension-sdk';
import { MangaThemesia } from './mangathemesia/MangaThemesia';

class Doujinku extends MangaThemesia {
  readonly name = 'Doujinku';
  readonly baseUrl = 'https://doujinku.org';

  override datePattern = 'd MMMM yyyy';
}

export default defineExtension({
  createSource: () => new Doujinku().toSource(),
});
