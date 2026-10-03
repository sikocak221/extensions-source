import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class MangaManiacs extends Madara {
  readonly name = 'MangaManiacs';
  readonly baseUrl = 'https://mangamaniacs.org';
}

export default defineExtension({
  createSource: () => new MangaManiacs().toSource(),
});
