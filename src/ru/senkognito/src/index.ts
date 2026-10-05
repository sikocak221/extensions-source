import { defineExtension } from '@matane/extension-sdk';
import { Senkuro } from './senkuro/Senkuro';

class Senkognito extends Senkuro {
  readonly name = 'Senkognito';
  readonly baseUrl = 'https://senkognito.com';
  readonly appId = '5033164800100';
}

export default defineExtension({
  createSource: () => new Senkognito().toSource(),
});
