import { defineExtension } from '@matane/extension-sdk';
import { GoDa } from './goda/GoDa';

class Goda extends GoDa {
  readonly name = 'Goda';
  readonly baseUrl = 'https://manhuascans.org';
  readonly lang = 'en';
}

export default defineExtension({
  createSource: () => new Goda().toSource(),
});
