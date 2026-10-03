import { defineExtension } from '@matane/extension-sdk';
import { BakkinReaderX, IMAGE_QUALITY_PREFERENCE } from './bakkin/BakkinReaderX';

class Bakkin extends BakkinReaderX {
  readonly name = 'Bakkin';
  readonly baseUrl = 'https://bakkin.moe/reader/';
}

export default defineExtension({
  preferences: () => [IMAGE_QUALITY_PREFERENCE],
  createSource: () => new Bakkin().toSource(),
});
