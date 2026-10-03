import { defineExtension } from '@matane/extension-sdk';
import { NatsuId } from './natsuid/NatsuId';

class Natsu extends NatsuId {
  readonly name = 'Natsu';
  readonly baseUrl = 'https://natsu.one';
}

export default defineExtension({
  createSource: () => new Natsu().toSource(),
});
