import { defineExtension } from '@matane/extension-sdk';
import { Madara } from './madara/Madara';

class Cat300 extends Madara {
  readonly name = 'Cat300';
  readonly baseUrl = 'https://cat-300.com';
}

export default defineExtension({
  createSource: () => new Cat300().toSource(),
});
