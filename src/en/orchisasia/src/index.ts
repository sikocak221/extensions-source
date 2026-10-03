import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class Orchisasia extends Madara {
  readonly name = 'Orchisasia';
  readonly baseUrl = 'https://www.orchisasia.org';

  override mangaSubString = 'comic';
}

export default defineExtension({
  createSource: () => new Orchisasia().toSource(),
});
