import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class HentaiXDickgirl extends Madara {
  readonly name = 'HentaiXDickgirl';
  readonly baseUrl = 'https://hentaixdickgirl.com';
}

export default defineExtension({
  createSource: () => new HentaiXDickgirl().toSource(),
});
