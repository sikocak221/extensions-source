import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class LinkManga extends Madara {
  readonly name = 'LinkManga';
  readonly baseUrl = 'https://linkmanga.com';
}

export default defineExtension({
  createSource: () => new LinkManga().toSource(),
});
