import { defineExtension } from '@matane/extension-sdk';
import { PizzaReader } from './pizzareader/PizzaReader';

class TuttoAnimeManga extends PizzaReader {
  readonly name = 'TuttoAnimeManga';
  readonly baseUrl = 'https://tuttoanimemanga.net';
}

export default defineExtension({
  createSource: () => new TuttoAnimeManga().toSource(),
});
