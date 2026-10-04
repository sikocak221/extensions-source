import { defineExtension } from '@matane/extension-sdk';
import { PizzaReader } from './pizzareader/PizzaReader';

class PhoenixScans extends PizzaReader {
  readonly name = 'Phoenix Scans';
  readonly baseUrl = 'https://www.phoenixscans.com';
}

export default defineExtension({
  createSource: () => new PhoenixScans().toSource(),
});
