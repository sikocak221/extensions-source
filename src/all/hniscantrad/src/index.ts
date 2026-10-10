import { defineExtension } from '@matane/extension-sdk';
import { PizzaReader } from './pizzareader/PizzaReader';

class HNIScantrad extends PizzaReader {
  readonly name = "HNI-Scantrad";
  readonly baseUrl = "https://hni-scantrad.net";
}

export default defineExtension({
  createSource: () => new HNIScantrad().toSource(),
});
