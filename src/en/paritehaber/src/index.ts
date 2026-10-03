import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class Paritehaber extends Madara {
  readonly name = 'Paritehaber';
  readonly baseUrl = 'https://www.paritehaber.com';
}

export default defineExtension({
  createSource: () => new Paritehaber().toSource(),
});
