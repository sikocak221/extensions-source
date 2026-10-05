import { defineExtension } from '@matane/extension-sdk';
import { Senkuro } from './senkuro/Senkuro';

class SenkuroSource extends Senkuro {
  readonly name = 'Senkuro';
  readonly baseUrl = 'https://senkuro.com';
  readonly appId = '4026531840100';
}

export default defineExtension({
  createSource: () => new SenkuroSource().toSource(),
});
