import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class ManhuaHot extends Madara {
  readonly name = 'ManhuaHot';
  readonly baseUrl = 'https://manhuahot.com';
}

export default defineExtension({
  createSource: () => new ManhuaHot().toSource(),
});
