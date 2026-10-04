import { defineExtension } from '@matane/extension-sdk';
import { PizzaReader } from './pizzareader/PizzaReader';

class LupiTeam extends PizzaReader {
  readonly name = 'LupiTeam';
  readonly baseUrl = 'https://lupiteam.net';
}

export default defineExtension({
  createSource: () => new LupiTeam().toSource(),
});
