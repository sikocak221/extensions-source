import { defineExtension } from '@matane/extension-sdk';
import { Masonry } from './masonry/Masonry';

class XArtHunter extends Masonry {
  readonly name = 'XArt Hunter';
  readonly baseUrl = 'https://www.xarthunter.com';
}

export default defineExtension({
  createSource: () => new XArtHunter().toSource(),
});
