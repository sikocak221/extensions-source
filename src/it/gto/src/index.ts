import { defineExtension } from '@matane/extension-sdk';
import { PizzaReader } from './pizzareader/PizzaReader';

class GTOTheGreatSite extends PizzaReader {
  readonly name = 'GTO The Great Site';
  readonly baseUrl = 'https://reader.gtothegreatsite.net';
}

export default defineExtension({
  createSource: () => new GTOTheGreatSite().toSource(),
});
