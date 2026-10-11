import { defineExtension } from '@matane/extension-sdk';
import { Masonry } from './masonry/Masonry';

class JoymiiHub extends Masonry {
  readonly name = 'Joymii Hub';
  readonly baseUrl = 'https://www.joymiihub.com';
}

export default defineExtension({
  createSource: () => new JoymiiHub().toSource(),
});
