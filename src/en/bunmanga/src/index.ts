import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class BunManga extends Madara {
  readonly name = 'Bun Manga';
  readonly baseUrl = 'https://bunmanga.com';
}

export default defineExtension({
  createSource: () => new BunManga().toSource(),
});
