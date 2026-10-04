import { defineExtension } from '@matane/extension-sdk';
import { PizzaReader } from './pizzareader/PizzaReader';

class BlueSolo extends PizzaReader {
  readonly name = 'Blue Solo';
  readonly baseUrl = 'https://bluesolo.org';
}

export default defineExtension({
  createSource: () => new BlueSolo().toSource(),
});
