import { defineExtension } from '@matane/extension-sdk';
import { Hwalumi } from './hwalumi/Hwalumi';

class Hwago extends Hwalumi {
  readonly name = 'Hwago';
  readonly baseUrl = 'https://02.hwago.xyz';
}

export default defineExtension({
  createSource: () => new Hwago().toSource(),
});
