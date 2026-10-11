import { defineExtension } from '@matane/extension-sdk';
import { Masonry } from './masonry/Masonry';

class PlaymateHunter extends Masonry {
  readonly name = 'Playmate Hunter';
  readonly baseUrl = 'https://pmatehunter.com';
}

export default defineExtension({
  createSource: () => new PlaymateHunter().toSource(),
});
