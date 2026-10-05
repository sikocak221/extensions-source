import { defineExtension } from '@matane/extension-sdk';
import { PizzaReader } from './pizzareader/PizzaReader';

class MangaCorporation extends PizzaReader {
  readonly name = 'Manga-Corporation';
  readonly baseUrl = 'https://manga-corporation.com';
}

export default defineExtension({
  createSource: () => new MangaCorporation().toSource(),
});
