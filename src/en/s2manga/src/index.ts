import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class S2Manga extends Madara {
  readonly name = 'S2Manga';
  readonly baseUrl = 'https://s2read.com';
}

export default defineExtension({
  createSource: () => new S2Manga().toSource(),
});
