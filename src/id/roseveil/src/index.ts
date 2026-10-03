import { defineExtension } from '@matane/extension-sdk';
import { LoneSeal } from './loneseal/LoneSeal';

class Roseveil extends LoneSeal {
  readonly name = 'Roseveil';
  readonly baseUrl = 'https://roseveil.org';
}

export default defineExtension({
  createSource: () => new Roseveil().toSource(),
});
