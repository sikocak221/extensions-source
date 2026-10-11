import { defineExtension } from '@matane/extension-sdk';
import { Masonry } from './masonry/Masonry';

class FTVHunter extends Masonry {
  readonly name = 'FTV Hunter';
  readonly baseUrl = 'https://www.ftvhunter.com';
}

export default defineExtension({
  createSource: () => new FTVHunter().toSource(),
});
