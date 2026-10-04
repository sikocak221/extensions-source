import { defineExtension } from '@matane/extension-sdk';
import { Iken } from './iken/Iken';

class Azora extends Iken {
  readonly name = 'Azora';
  readonly baseUrl = 'https://azorafly.com';
}

export default defineExtension({
  createSource: () => new Azora().toSource(),
});
