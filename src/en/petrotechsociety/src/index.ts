import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class Petrotechsociety extends Madara {
  readonly name = 'Petrotechsociety';
  readonly baseUrl = 'https://www.petrotechsociety.org';

  override chapterDatePattern = 'dd/MM/yyyy';
}

export default defineExtension({
  createSource: () => new Petrotechsociety().toSource(),
});
