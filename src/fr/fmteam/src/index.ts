import { defineExtension } from '@matane/extension-sdk';
import { PizzaReader } from './pizzareader/PizzaReader';

class FMTEAM extends PizzaReader {
  readonly name = 'FMTEAM';
  readonly baseUrl = 'https://fmteam.fr';
}

export default defineExtension({
  createSource: () => new FMTEAM().toSource(),
});
