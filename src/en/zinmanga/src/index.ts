import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class Zinmanga extends Madara {
  readonly name = 'Zinmanga';
  readonly baseUrl = 'https://mangazin.org';

  override filterNonMangaItems = false;
}

export default defineExtension({
  createSource: () => new Zinmanga().toSource(),
});
