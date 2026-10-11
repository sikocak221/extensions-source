import { defineExtension } from '@matane/extension-sdk';
import { Masonry } from './masonry/Masonry';

class MetartHunter extends Masonry {
  readonly name = 'Metart Hunter';
  readonly baseUrl = 'https://www.metarthunter.com';
}

export default defineExtension({
  createSource: () => new MetartHunter().toSource(),
});
